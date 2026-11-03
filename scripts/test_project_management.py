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
            result=None if response.status == 204 else json.load(response)
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
    def test_stale_edit_is_rejected(self):
        item=self.create()
        path='/api/projects/test/work-items/'+item['id']
        first=self.admin.request(path,{'title':'Primeira edição','expectedRev':item['rev']},method='PATCH')
        self.assertEqual(first['rev'],item['rev']+1)
        self.denied(409,lambda:self.admin.request(path,{'title':'Edição antiga','expectedRev':item['rev']},method='PATCH'))
        self.assertEqual(self.admin.request(path,{'title':'Sem token'},method='PATCH')['title'],'Sem token')
    def test_bootstrap_and_password_storage(self):
        with self.assertRaises(ValueError): project_auth.create_user(app.DATA_DIR,'Outro','other@example.test',INITIAL,'admin',first_admin=True)
        with project_auth.database(app.DATA_DIR) as conn:
            row=conn.execute('SELECT password_hash FROM local_users WHERE id=?',(self.admin_user['id'],)).fetchone()
        self.assertNotIn(CHANGED,row['password_hash'])
        self.assertTrue(project_auth.verify_password(CHANGED,row['password_hash']))

    def test_public_project_information_and_work_plan(self):
        anonymous=Client(self.base)
        result=anonymous.request('/api/projects/test/notes',{'notes':' Informação pública '},method='PATCH')
        self.assertEqual(result['notes'],'Informação pública')
        result=anonymous.request('/api/projects/test',{'notes':'Informações pela página anterior'},method='PATCH')
        self.assertEqual(result['notes'],'Informações pela página anterior')
        self.denied(401,lambda:anonymous.request('/api/projects/test',{'notes':'texto','title':'indevido'},method='PATCH'))
        self.denied(400,lambda:anonymous.request('/api/projects/test/notes',{'notes':'texto','title':'indevido'},method='PATCH'))
        self.denied(400,lambda:anonymous.request('/api/projects/test/notes',{'notes':123},method='PATCH'))
        self.denied(404,lambda:anonymous.request('/api/projects/inexistente/notes',{'notes':'texto'},method='PATCH'))
        self.denied(401,lambda:anonymous.request('/api/projects/test',{'title':'indevido'},method='PATCH'))
        self.denied(401,lambda:self.create(anonymous))
        self.denied(401,lambda:anonymous.request('/api/project-settings',{'attentionDelayPercent':50}))
        self.denied(401,lambda:anonymous.request('/api/project-settings/plan-image',method='DELETE'))
        with tempfile.TemporaryDirectory() as directory, patch.object(app,'PROJECT_PLAN_UPLOADS',Path(directory)):
            boundary='public-plan-test'
            raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="plano.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+b'\x89PNG\r\n\x1a\n'+f'\r\n--{boundary}--\r\n'.encode())
            result=anonymous.request('/api/project-settings/plan-image',raw=raw,content_type=f'multipart/form-data; boundary={boundary}')
            self.assertEqual(result['workPlanImage']['name'],'plano.png')
            self.assertTrue(Path(result['workPlanImage']['path']).is_file())

    def test_public_project_creation(self):
        anonymous=Client(self.base)
        project=anonymous.request('/api/projects',{'name':'Evolutiva pública','notes':'Escopo inicial'})
        self.assertEqual(project['type'],'construction')
        study=anonymous.request('/api/projects/study',{'title':'Estudo público','description':'Análise inicial'})
        self.assertEqual(study['type'],'study')
        self.denied(400,lambda:anonymous.request('/api/projects',{'name':''}))
        self.denied(400,lambda:anonymous.request('/api/projects/study',{'title':''}))
        self.denied(400,lambda:anonymous.request('/api/projects/upload',raw=b'--upload-test--\r\n',content_type='multipart/form-data; boundary=upload-test'))
        self.denied(401,lambda:anonymous.request('/api/projects/'+project['id'],method='DELETE'))
        self.denied(401,lambda:anonymous.request('/api/projects/'+study['id'],{'title':'Alteração'},method='PATCH'))
        self.denied(401,lambda:self.create(anonymous))

    def test_work_roles_and_permissions(self):
        result=self.admin.request('/api/auth/users',{'name':'Testador','email':uuid.uuid4().hex+'@example.test','workRole':'tester'})
        user=result['user']
        self.assertEqual(user['workRole'],'tester')
        client=Client(self.base)
        client.login(user['email'],result['initialPassword'])
        client.change(current=result['initialPassword'])
        path=f"/api/auth/users/{user['id']}/update"
        self.denied(403,lambda:client.request(path,{'role':'collaborator','active':True,'workRole':'po'}))
        self.admin.request(path,{'role':'collaborator','active':True,'workRole':'developer'})
        identity=client.request('/api/auth/session',method='GET')['user']
        self.assertEqual(identity['workRole'],'developer')
        self.assertEqual(identity['role'],'collaborator')
        self.admin.request(path,{'role':'collaborator','active':True})
        self.assertEqual(client.request('/api/auth/session',method='GET')['user']['workRole'],'developer')
        self.denied(400,lambda:self.admin.request(path,{'role':'collaborator','active':True,'workRole':'admin'}))
        self.denied(400,lambda:self.admin.request('/api/auth/users',{'name':'Inválido','email':uuid.uuid4().hex+'@example.test','workRole':['tester']}))
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
    def test_bugs_signal_blocking_without_moving_definition(self):
        column = self.admin.request('/api/projects/test/work-item-columns', {'title':'Em Homol'})
        parent = self.create()
        definition = self.create(type='technical-definition', parentId=parent['id'], status=column['id'])
        path = f'/api/projects/test/work-items/{definition["id"]}'
        def current():
            projects = self.admin.request('/api/projects', method='GET')
            return next(item for item in projects[0]['workItems'] if item['id'] == definition['id'])
        bug = self.create(type='bug', parentId=definition['id'], status='open')
        bug_path = f'/api/projects/test/work-items/{bug["id"]}'
        self.assertEqual(current()['status'], column['id'])
        self.assertEqual([item['id'] for item in current()['pendingBugs']], [bug['id']])
        self.admin.request(bug_path, {'status':'ready-for-retest'}, 'PATCH')
        self.assertEqual(current()['status'], column['id'])
        self.assertEqual(len(current()['pendingBugs']), 1)
        self.admin.request(bug_path, {'status':'closed'}, 'PATCH')
        self.assertEqual(current()['pendingBugs'], [])
        self.assertEqual(current()['status'], column['id'])
        self.admin.request(path, {'status':'done'}, 'PATCH')
        self.admin.request(bug_path, {'status':'fixing'}, 'PATCH')
        self.assertEqual(current()['status'], 'done')
        self.assertEqual(len(current()['pendingBugs']), 1)
        self.admin.request(bug_path, {'archived':True}, 'PATCH')
        self.assertEqual(current()['pendingBugs'], [])
        self.admin.request(path, {'blocked':True, 'blockedReason':'Aguardando ambiente'}, 'PATCH')
        self.assertTrue(current()['blocked'])
        self.assertEqual(current()['status'], 'done')
        self.admin.request(bug_path, {'archived':False}, 'PATCH')
        second = self.create(type='technical-definition', parentId=parent['id'], status=column['id'])
        self.admin.request(bug_path, {'parentId':second['id']}, 'PATCH')
        self.assertEqual(current()['pendingBugs'], [])
        self.admin.request(bug_path, method='DELETE')
        self.admin.request(path, {'blocked':False}, 'PATCH')
        before = app.PROJECTS_FILE.read_bytes()
        self.assertFalse(current()['blocked'])
        self.assertEqual(app.PROJECTS_FILE.read_bytes(), before)

    def test_legacy_blocking_recovers_stage_once(self):
        project = {'workItemColumns':[{'id':'custom-test','title':'Em Homol'}], 'workItems':[
            {'id':'definition','type':'technical-definition','status':'blocked','history':[{'field':'status','before':'custom-test','after':'blocked'}]},
            {'id':'bug','type':'bug','parentId':'definition','status':'open','title':'Bug'},
            {'id':'manual','type':'requirement','status':'blocked','blockedReason':'Dependência externa'}]}
        app._normalize_legacy_blocking(project)
        definition, bug, manual = project['workItems']
        self.assertEqual(definition['status'], 'custom-test')
        self.assertFalse(definition['blocked'])
        self.assertTrue(manual['blocked'])
        self.assertEqual(manual['status'], 'analysis')
        history = list(definition['history'])
        app._normalize_legacy_blocking(project)
        self.assertEqual(definition['history'], history)
        app._sync_definition_blocking(project, 'definition')
        self.assertEqual(len(definition['pendingBugs']), 1)
        self.assertEqual(definition['status'], 'custom-test')

    def test_z_login_attempt_limit(self):
        client=Client(self.base)
        for _ in range(5): self.denied(401,lambda:client.login('missing@example.test','invalid-password'))
        self.denied(429,lambda:client.login('missing@example.test','invalid-password'))

if __name__=='__main__': unittest.main()
