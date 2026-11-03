"""Local, interactive account bootstrap and administrator password recovery."""
import argparse
import getpass
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app
import project_auth

parser=argparse.ArgumentParser(description='Gerenciar acesso local ao painel')
parser.add_argument('action',choices=['bootstrap','reset-password'])
args=parser.parse_args()
email=input('E-mail: ').strip()
name=input('Nome: ').strip() if args.action=='bootstrap' else ''
password=getpass.getpass('Senha inicial (mínimo de 12 caracteres): ')
if password!=getpass.getpass('Confirme a senha: '):
    parser.exit(1,'As senhas não conferem.\n')
try:
    if args.action=='bootstrap':
        project_auth.create_user(app.DATA_DIR,name,email,password,'admin',first_admin=True)
    else:
        encoded=project_auth.hash_password(password)
        with project_auth.database(app.DATA_DIR) as conn:
            row=conn.execute('SELECT id FROM local_users WHERE email=?',(email.casefold(),)).fetchone()
            if not row: raise ValueError('Conta não encontrada.')
            conn.execute('UPDATE local_users SET password_hash=?,must_change=1 WHERE id=?',(encoded,row['id']))
            conn.execute('DELETE FROM local_sessions WHERE user_id=?',(row['id'],))
    print('Conta preparada. A senha deve ser trocada no próximo acesso.')
except ValueError as exc:
    parser.exit(1,str(exc)+'\n')
