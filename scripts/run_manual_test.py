"""Start an isolated local instance for a person to test the portal."""
from pathlib import Path
import json
import os
import secrets
import sys
import tempfile

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
directory=Path(tempfile.mkdtemp(prefix='manual-test-',dir=root/'work'))
os.environ['DATA_DIR']=str(directory)
os.environ['PROJECTS_FILE']=str(directory/'projects.json')
os.environ['PROJECT_SETTINGS_FILE']=str(directory/'project_settings.json')
os.environ['DB_PATH']=str(directory/'ecargo.sqlite')
os.environ['BASE_PATH']=''
os.environ['AUTH_COOKIE_SECURE']='0'
import app
import project_auth

accounts=[]
for name,email,role in [('Administrador de teste','admin@teste.local','admin'),('Colaborador de teste','colaborador@teste.local','collaborator')]:
    password=secrets.token_urlsafe(12)
    project_auth.create_user(directory,name,email,password,role,first_admin=role=='admin')
    accounts.append({'email':email,'initialPassword':password})
app.write_projects([{'id':'projeto-teste','name':'Projeto de teste','folderPath':'','notes':'Ambiente isolado para testar login, cards, mensagens e evidências.','workItems':[{'id':'card-teste','type':'requirement','title':'Validar o novo fluxo de gestão','status':'backlog','description':'Entre com sua conta, atribua um responsável, envie uma mensagem com menção e adicione uma evidência.','priority':'normal','assignee':'','assigneeId':'','checklist':[{'text':'Testar login e troca da senha inicial','done':False},{'text':'Enviar uma mensagem com menção','done':False},{'text':'Colar uma imagem nas evidências','done':False}],'comments':[],'evidence':[],'history':[]}]}])
app.init_db()
try:
    server=app.ThreadingHTTPServer(('127.0.0.1',8766),app.Handler)
except OSError:
    server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
print(json.dumps({'url':f'http://127.0.0.1:{server.server_port}/projetos','accounts':accounts,'dataDir':str(directory)},ensure_ascii=False),flush=True)
server.serve_forever()
