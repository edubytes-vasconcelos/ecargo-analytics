"""HTTP integration checks for local login and card collaboration."""
import concurrent.futures
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app
import project_auth

INITIAL='Initial-test-password-123'
CHANGED='Changed-test-password-456'

class Client:
    def __init__(self,base):
        self.base=base+app.BASE_PATH
        self.cookies=CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf=''
    def request(self,path,payload=None,method='POST',raw=None,content_type='application/json',csrf=True):
        headers={'Content-Type':content_type}
        if csrf and self.csrf: headers['X-CSRF-Token']=self.csrf
        data=raw if raw is not None else json.dumps(payload or {}).encode()
        request=urllib.request.Request(self.base+path,data=None if method=='GET' else data,method=method,headers=headers)
        with self.opener.open(request,timeout=15) as response:
            result=json.load(response)
        if isinstance(result,dict) and result.get('csrfToken'): self.csrf=result['csrfToken']
        return result
    def login(self,email,password):
        self.request('/api/auth/session',method='GET')
        return self.request('/api/auth/login',{'email':email,'password':password})
    def change(self,current=INITIAL,new=CHANGED):
        return self.request('/api/auth/password',{'currentPassword':current,'newPassword':new})

class ProjectManagementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.original=app.PROJECTS_FILE,app.DATA_DIR,app.PROJECT_SETTINGS_FILE
        app.DATA_DIR=Path(cls.temp.name)
        app.PROJECTS_FILE=app.DATA_DIR/'projects.json'
        app.PROJECT_SETTINGS_FILE=app.DATA_DIR/'settings.json'
        cls.env=patch.dict(os.environ,{'AUTH_COOKIE_SECURE':'0'})
        cls.env.start()
        app.write_projects([{'id':'test','name':'Teste','workItems':[]}])
        cls.admin_user=project_auth.create_user(app.DATA_DIR,'Administrador teste','admin@example.test',INITIAL,'admin',first_admin=True)
        cls.server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.admin=Client(cls.base)
        cls.admin.login('admin@example.test',INITIAL)
        cls.admin.change()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
        app.PROJECTS_FILE,app.DATA_DIR,app.PROJECT_SETTINGS_FILE=cls.original
        cls.env.stop(); cls.temp.cleanup()
    def collaborator(self):
        email=uuid.uuid4().hex+'@example.test'
        result=self.admin.request('/api/auth/users',{'name':'Colaborador teste','email':email,'role':'collaborator'})
        client=Client(self.base); client.login(email,result['initialPassword']); client.change(current=result['initialPassword'])
        return client,result['user']
    def create(self,client=None,**extra):
        return (client or self.admin).request('/api/projects/test/work-items',{'type':'requirement','title':'Card de teste','status':'backlog',**extra})
    def denied(self,code,call):
        with self.assertRaises(urllib.error.HTTPError) as error: call()
        self.assertEqual(error.exception.code,code)
    def test_bootstrap_and_password_storage(self):
        with self.assertRaises(ValueError): project_auth.create_user(app.DATA_DIR,'Outro','other@example.test',INITIAL,'admin',first_admin=True)
        with project_auth.database(app.DATA_DIR) as conn:
            row=conn.execute('SELECT password_hash FROM local_users WHERE id=?',(self.admin_user['id'],)).fetchone()
        self.assertNotIn(CHANGED,row['password_hash'])
        self.assertTrue(project_auth.verify_password(CHANGED,row['password_hash']))
    def test_initial_password_change_is_mandatory(self):
        email=uuid.uuid4().hex+'@example.test'
        user=self.admin.request('/api/auth/users',{'name':'Primeiro acesso','email':email})
        client=Client(self.base)
        result=client.login(email,user['initialPassword'])
        self.assertTrue(result['user']['mustChangePassword'])
        self.denied(403,lambda:self.create(client))
        self.denied(403,lambda:client.request('/api/auth/users',method='GET'))
        self.denied(400,lambda:client.change(current=user['initialPassword'],new='short'))
        self.denied(400,lambda:client.change(current='incorrect-current-password'))
        self.assertFalse(client.change(current=user['initialPassword'])['user']['mustChangePassword'])
        self.create(client)
    def test_management_conversation_mentions_and_notifications(self):
        client,user=self.collaborator()
        item=self.create(assigneeId=user['id'],priority='urgent',dueDate='2027-01-15',checklist=[{'text':'Validar','done':False}])
        path=f'/api/projects/test/work-items/{item["id"]}'
        updated=client.request(path,{'status':'analysis'},'PATCH')
        self.assertEqual(updated['assigneeId'],user['id'])
        self.assertEqual(updated['checklist'],item['checklist'])
        self.assertEqual(updated['history'][-1]['authorId'],user['id'])
        entry=self.admin.request(path+'/comments',{'author':'Spoof','authorId':'fake','text':'Pode validar?','mentionIds':[user['id']]})
        self.assertEqual(entry['authorId'],self.admin_user['id'])
        reply=client.request(path+'/comments',{'text':'Validado','replyTo':entry['id']})
        self.assertEqual(reply['authorId'],user['id'])
        notifications=client.request('/api/auth/notifications',method='GET')
        self.assertTrue(any(n['itemId']==item['id'] and not n['seen'] for n in notifications))
        client.request('/api/auth/notifications/read')
        self.assertTrue(all(n['seen'] for n in client.request('/api/auth/notifications',method='GET')))
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda i:client.request(path+'/comments',{'text':str(i)}),range(4)))
        saved=self.admin.request(path,{'nextAction':'Revisar'},'PATCH')
        self.assertEqual(len(saved['comments']),6)
        self.denied(400,lambda:self.admin.request(path,{'dueDate':'2026-02-30'},'PATCH'))
    def test_evidence_requires_login_and_preserves_bytes(self):
        item=self.create()
        boundary='test-boundary'; binary=b'Evidence\x00\xff\r\n--'
        body=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidencia.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+binary+f'\r\n--{boundary}--\r\n'.encode()
        entry=self.admin.request(f'/api/projects/test/work-items/{item["id"]}/evidence',raw=body,content_type=f'multipart/form-data; boundary={boundary}')
        with self.admin.opener.open(self.base+entry['url'],timeout=10) as response: self.assertEqual(response.read(),binary)
        self.assertEqual(entry['authorId'],self.admin_user['id'])
        self.denied(401,lambda:urllib.request.urlopen(self.base+entry['url'],timeout=10))
    def test_admin_permissions_reset_disable_and_last_admin(self):
        client,user=self.collaborator()
        self.denied(403,lambda:client.request('/api/auth/users',{'name':'Spoof','email':'spoof@example.test'}))
        self.denied(403,lambda:client.request('/api/project-settings',{},'PATCH'))
        self.denied(400,lambda:self.admin.request(f'/api/auth/users/{self.admin_user["id"]}/update',{'role':'collaborator','active':True}))
        reset=self.admin.request(f'/api/auth/users/{user["id"]}/reset-password',{})
        self.denied(401,lambda:self.create(client))
        fresh=Client(self.base)
        self.assertTrue(fresh.login(user['email'],reset['initialPassword'])['user']['mustChangePassword'])
        fresh.change(current=reset['initialPassword'])
        self.admin.request(f'/api/auth/users/{user["id"]}/update',{'role':'collaborator','active':False})
        self.denied(401,lambda:self.create(fresh))
        self.denied(401,lambda:Client(self.base).login(user['email'],CHANGED))
    def test_csrf_logout_and_session_expiry(self):
        client,user=self.collaborator()
        self.denied(403,lambda:client.request('/api/projects/test/work-items',{},csrf=False))
        client.request('/api/auth/logout')
        self.denied(401,lambda:self.create(client))
        client.login(user['email'],CHANGED)
        with project_auth.database(app.DATA_DIR) as conn: conn.execute('UPDATE local_sessions SET expires=0 WHERE user_id=?',(user['id'],))
        self.denied(401,lambda:self.create(client))
    def test_z_login_attempt_limit(self):
        client=Client(self.base)
        for _ in range(5): self.denied(401,lambda:client.login('missing@example.test','invalid-password'))
        self.denied(429,lambda:client.login('missing@example.test','invalid-password'))

if __name__=='__main__': unittest.main()
