import os
from pathlib import Path
import subprocess
import sys
from test_project_management import ProjectManagementTests

ProjectManagementTests.setUpClass()
try:
    instance = ProjectManagementTests()
    instance.create()
    subprocess.run(['node', str(Path(__file__).with_suffix('.cjs')), ProjectManagementTests.base + __import__('app').BASE_PATH], check=True, timeout=120)
finally:
    ProjectManagementTests.tearDownClass()
