import os
from pathlib import Path
import subprocess
import sys
from test_project_management import ProjectManagementTests

ProjectManagementTests.setUpClass()
try:
    instance = ProjectManagementTests()
    columns=[ProjectManagementTests.admin.request('/api/projects/test/work-item-columns',{'title':title}) for title in ['Tarefas pendentes','Para Desenv','Em Desenv','Para testes Signa','Em Homol']]
    ProjectManagementTests.admin.request('/api/projects/test/work-item-column-order',{'order':[column['id'] for column in columns]+['backlog','progress','blocked','done']},'PATCH')
    instance.create(status=columns[1]['id'])
    subprocess.run(['node', str(Path(__file__).with_suffix('.cjs')), ProjectManagementTests.base + __import__('app').BASE_PATH], check=True, timeout=180)
finally:
    ProjectManagementTests.tearDownClass()
