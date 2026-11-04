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
    def test_bug_correction_and_homologation_workflow(self):
        developer, developer_user = self.collaborator()
        tester, tester_user = self.collaborator()
        for user, role in [(developer_user, 'developer'), (tester_user, 'tester')]:
            self.admin.request(f"/api/auth/users/{user['id']}/update", {'role':'collaborator','active':True,'workRole':role})
        homol = self.admin.request('/api/projects/test/work-item-columns', {'title':'Em Homol'})
        testing = self.admin.request('/api/projects/test/work-item-columns', {'title':'Para testes Signa'})
        parent = self.create()
        self.denied(400,lambda:self.create(type='technical-definition',parentId=parent['id'],status='definition'))
        self.admin.request(f"/api/projects/test/work-items/{parent['id']}",{'status':'analysis'},'PATCH')
        self.denied(400,lambda:self.create(type='technical-definition',parentId=parent['id'],status='definition'))
        self.admin.request(f"/api/projects/test/work-items/{parent['id']}",{'status':'waiting-info'},'PATCH')
        self.denied(400,lambda:self.create(type='technical-definition',parentId=parent['id'],status='definition'))
        self.denied(400,lambda:self.create(status=homol['id']))
        parent = self.admin.request(f"/api/projects/test/work-items/{parent['id']}",{'status':'approved'},'PATCH')
        artifact = self.create(type='technical-definition', parentId=parent['id'], status='definition')
        path = f"/api/projects/test/work-items/{artifact['id']}"
        parent_path = f"/api/projects/test/work-items/{parent['id']}"
        def current(item_id):
            project = next(p for p in self.admin.request('/api/projects',method='GET') if p['id']=='test')
            return next(item for item in project['workItems'] if item['id']==item_id)
        bug = self.create(developer,type='bug',parentId=artifact['id'],status='open')
        bug_path = f"/api/projects/test/work-items/{bug['id']}"
        self.assertEqual(current(artifact['id'])['status'],'definition')
        developer.request(bug_path,{'status':'ready-for-retest'},'PATCH')
        self.assertEqual(len(current(artifact['id'])['pendingBugs']),1)
        self.denied(403,lambda:developer.request(bug_path,{'status':'closed'},'PATCH'))
        self.denied(403,lambda:self.create(developer,type='bug',parentId=artifact['id'],status='closed'))
        self.denied(400,lambda:self.admin.request(path,{'status':homol['id']},'PATCH'))
        self.denied(400,lambda:self.admin.request(path,{'status':'done'},'PATCH'))
        self.denied(400,lambda:self.admin.request(parent_path,{'status':'analysis'},'PATCH'))
        self.assertEqual(self.admin.request(parent_path,{'status':'approved'},'PATCH')['status'],'approved')
        result = tester.request(bug_path,{'status':'closed'},'PATCH')
        self.assertEqual(result['history'][-1]['authorId'],tester_user['id'])
        self.assertEqual(current(artifact['id'])['pendingBugs'],[])
        direct_bug = self.create(developer,type='bug',parentId=artifact['id'],status='open')
        direct_path = f"/api/projects/test/work-items/{direct_bug['id']}"
        result = tester.request(direct_path,{'status':'closed'},'PATCH')
        self.assertEqual(result['status'],'closed')
        self.assertFalse(any(entry.get('after')=='ready-for-retest' for entry in result['history']))
        self.admin.request(path,{'status':homol['id']},'PATCH')
        developer.request(bug_path,{'status':'fixing'},'PATCH')
        item = current(artifact['id'])
        self.assertEqual(item['status'],testing['id'])
        self.assertEqual([bug['id']],[entry['id'] for entry in item['pendingBugs']])
        self.assertIn('retorno para teste',item['history'][-1]['author'])
        requirement = current(parent['id'])
        self.assertEqual(requirement['status'],'approved')
        self.assertEqual([bug['id']],[entry['id'] for entry in requirement['pendingBugs']])
        tester.request(bug_path,{'status':'closed'},'PATCH')
        self.admin.request(path,{'status':'scheduled-deployment',
            'checklist':[{'text':'Validado em teste','done':True}],
            'sourceCodeLinks':[{'type':'backend','url':'https://example.test/code'}],
            'deploymentPath':'https://example.test/package'},'PATCH')
        self.admin.request(path,{'status':'done'},'PATCH')
        developer.request(bug_path,{'status':'fixing'},'PATCH')
        self.assertEqual(current(artifact['id'])['status'],testing['id'])

    def test_technical_deployment_validation(self):
        parent = self.create(status='approved')
        artifact = self.create(type='technical-definition', parentId=parent['id'], status='testing')
        path = f"/api/projects/test/work-items/{artifact['id']}"
        ready = {
            'checklist': [{'text': 'Validar entrega', 'done': True}],
            'sourceCodeLinks': [{'type': 'backend', 'url': 'https://example.test/code'}],
            'deploymentPath': 'https://example.test/package',
        }
        for invalid in [
            {'checklist': []},
            {'checklist': [{'text': 'Validar entrega', 'done': False}]},
            {'sourceCodeLinks': []},
            {'deploymentPath': ''},
        ]:
            self.denied(400, lambda invalid=invalid: self.admin.request(
                path, {**ready, **invalid, 'status': 'scheduled-deployment'}, 'PATCH'))
        self.denied(400, lambda: self.admin.request(path, {**ready, 'status': 'done'}, 'PATCH'))
        scheduled = self.admin.request(path, {**ready, 'status': 'scheduled-deployment'}, 'PATCH')
        self.assertEqual(scheduled['status'], 'scheduled-deployment')
        self.denied(400, lambda: self.admin.request(path, {'status': 'done', 'deploymentPath': ''}, 'PATCH'))
        deployed = self.admin.request(path, {'status': 'done'}, 'PATCH')
        self.assertEqual(deployed['status'], 'done')
        bug = self.create(type='bug', parentId=artifact['id'], status='open')
        project = next(p for p in self.admin.request('/api/projects', method='GET') if p['id'] == 'test')
        updated = next(i for i in project['workItems'] if i['id'] == artifact['id'])
        self.assertNotEqual(updated['status'], 'done')
        self.denied(400, lambda: self.admin.request(path, {'status': 'scheduled-deployment'}, 'PATCH'))
        self.admin.request(f"/api/projects/test/work-items/{bug['id']}", {'status': 'closed'}, 'PATCH')
        self.admin.request(path, {'status': 'scheduled-deployment'}, 'PATCH')
        self.admin.request(path, {'status': 'done'}, 'PATCH')

    def test_existing_homologation_with_pending_bugs_is_reconciled_once(self):
        project = {'id':'workflow-migration','name':'Migração de fluxo','workItemColumns':[{'id':'custom-homol','title':'Em Homol'}], 'workItems':[
            {'id':'requirement','type':'requirement','title':'Requisito','status':'approved'},
            {'id':'artifact','type':'technical-definition','title':'Artefato','status':'custom-homol','parentId':'requirement'},
            {'id':'bug','type':'bug','title':'Bug pendente','status':'ready-for-retest','parentId':'artifact'}]}
        app.write_projects(app.read_projects()+[project])
        first = next(p for p in app.projects_payload() if p['id']==project['id'])
        self.assertEqual(first['workItems'][0]['status'],'approved')
        self.assertEqual(first['workItems'][1]['status'],'testing')
        persisted = next(p for p in app.read_projects() if p['id']==project['id'])
        history = persisted['workItems'][1]['history']
        app.projects_payload()
        persisted = next(p for p in app.read_projects() if p['id']==project['id'])
        self.assertEqual(persisted['workItems'][1]['history'],history)

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

    def test_public_schedule_update(self):
        anonymous=Client(self.base)
        project=anonymous.request('/api/projects',{'name':'Cronograma público','notes':'Escopo'})
        study=anonymous.request('/api/projects/study',{'title':'Estudo sem cronograma'})
        boundary='schedule-test'
        def upload(project_id, filename='cronograma.xml'):
            raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/xml\r\n\r\n<Project xmlns="http://schemas.microsoft.com/project"><Name>Teste</Name></Project>\r\n--{boundary}--\r\n').encode()
            return anonymous.request(f'/api/projects/{project_id}/upload',raw=raw,content_type=f'multipart/form-data; boundary={boundary}')
        with tempfile.TemporaryDirectory() as directory, patch.object(app,'PROJECT_UPLOADS',Path(directory)), patch.object(app,'inspect_project',return_value={}):
            result=upload(project['id'])
            self.assertEqual(result['uploadedSchedule']['name'],'cronograma.xml')
            self.denied(400,lambda:upload(project['id'],'cronograma.txt'))
            self.denied(400,lambda:upload(study['id']))
            self.denied(404,lambda:upload('inexistente'))
        self.denied(401,lambda:anonymous.request('/api/projects/'+project['id'],method='DELETE'))
        self.denied(401,lambda:self.create(anonymous))

    def test_z_login_attempt_limit(self):
        client=Client(self.base)
        for _ in range(5): self.denied(401,lambda:client.login('missing@example.test','invalid-password'))
        self.denied(429,lambda:client.login('missing@example.test','invalid-password'))

if __name__=='__main__': unittest.main()
