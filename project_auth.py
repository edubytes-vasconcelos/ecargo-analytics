"""Local accounts, password hashing, sessions and collaboration notifications."""
from contextlib import contextmanager
from http.cookies import SimpleCookie
from pathlib import Path
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
import uuid

SESSION_TTL = 8 * 3600

@contextmanager
def database(data_dir):
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(Path(data_dir) / 'project_auth.sqlite', timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            conn.execute('CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, payload TEXT)')
            conn.execute('CREATE TABLE IF NOT EXISTS local_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1)')
            conn.execute('CREATE TABLE IF NOT EXISTS local_sessions (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL, expires REAL NOT NULL)')
            conn.execute('CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL)')
            conn.execute('CREATE TABLE IF NOT EXISTS auth_notifications (id TEXT PRIMARY KEY, user_id TEXT, payload TEXT, seen INTEGER DEFAULT 0)')
            yield conn
    finally:
        conn.close()

def public_user(row):
    return {'id': row['id'], 'name': row['name'], 'email': row['email'], 'role': row['role'], 'active': bool(row['active']), 'mustChangePassword': bool(row['must_change'])}

def validate_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError('A senha deve ter entre 12 e 256 caracteres.')

def hash_password(password):
    validate_password(password)
    salt = secrets.token_bytes(16)
    value = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=5, maxmem=64*1024*1024, dklen=32)
    return 'scrypt$16384$8$5$' + salt.hex() + '$' + value.hex()

def verify_password(password, encoded):
    try:
        if not isinstance(password, str) or len(password) > 256:
            return False
        algorithm, n, r, p, salt, expected = encoded.split('$')
        if (algorithm, n, r, p) != ('scrypt', '16384', '8', '5'):
            return False
        value = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=5, maxmem=64*1024*1024, dklen=32)
        return secrets.compare_digest(value.hex(), expected)
    except (ValueError, TypeError):
        return False

DUMMY_HASH = hash_password('dummy-account-verification-only')

def create_user(data_dir, name, email, password, role='collaborator', first_admin=False):
    name, email = str(name).strip(), str(email).strip().casefold()
    if not name or len(name) > 120 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
        raise ValueError('Informe nome e e-mail válidos.')
    if role not in {'admin', 'collaborator'}:
        raise ValueError('Perfil inválido.')
    encoded = hash_password(password)
    user_id = 'local:' + uuid.uuid4().hex
    with database(data_dir) as conn:
        conn.execute('BEGIN IMMEDIATE')
        if first_admin and conn.execute('SELECT 1 FROM local_users LIMIT 1').fetchone():
            raise ValueError('O administrador inicial já foi criado.')
        try:
            conn.execute('INSERT INTO local_users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)', (user_id,name,email,encoded,role))
        except sqlite3.IntegrityError:
            raise ValueError('Já existe uma conta com esse e-mail.')
        row = conn.execute('SELECT * FROM local_users WHERE id=?', (user_id,)).fetchone()
        user = public_user(row)
        conn.execute('INSERT OR REPLACE INTO auth_users VALUES (?,?)', (user_id,json.dumps(user)))
    return user

def cookie_value(handler, name):
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get('Cookie',''))
        return cookie[name].value if name in cookie else ''
    except Exception:
        return ''

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def cookie_header(name, value, max_age):
    base = os.environ.get('BASE_PATH','').strip('/')
    path = f'/{base}/' if base else '/'
    secure = '; Secure' if os.environ.get('AUTH_COOKIE_SECURE','1') != '0' else ''
    return f'{name}={value}; Path={path}; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}'

def respond(handler, payload, status=200, cookies=()):
    body = json.dumps(payload,ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header('Content-Type','application/json; charset=utf-8')
    handler.send_header('Cache-Control','no-store')
    handler.send_header('Content-Length',str(len(body)))
    for cookie in cookies:
        handler.send_header('Set-Cookie',cookie)
    handler.end_headers()
    handler.wfile.write(body)

def session(handler, data_dir):
    key = cookie_value(handler,'ecargo_local_session')
    if not key:
        return None
    with database(data_dir) as conn:
        row = conn.execute('SELECT u.*, s.csrf FROM local_sessions s JOIN local_users u ON u.id=s.user_id WHERE s.key=? AND s.expires>? AND u.active=1', (digest(key),time.time())).fetchone()
    return {'user':public_user(row),'csrfToken':row['csrf']} if row else None

def require_write(handler, data_dir, allow_password_change=False, admin=False):
    identity = session(handler,data_dir)
    if not identity:
        handler._send_json({'error':'Entre com seu e-mail e senha.','loginRequired':True},401)
        return None
    supplied = handler.headers.get('X-CSRF-Token','')
    if not supplied or not secrets.compare_digest(supplied,identity['csrfToken']):
        handler._send_json({'error':'Sessão inválida. Atualize a página e tente novamente.'},403)
        return None
    if identity['user']['mustChangePassword'] and not allow_password_change:
        handler._send_json({'error':'Troque sua senha inicial para continuar.','passwordChangeRequired':True},403)
        return None
    if admin and identity['user']['role'] != 'admin':
        handler._send_json({'error':'Esta ação exige um administrador.'},403)
        return None
    return identity

def require_read(handler,data_dir):
    identity=session(handler,data_dir)
    if not identity:
        handler._send_json({'error':'Entre com seu e-mail e senha.','loginRequired':True},401)
        return None
    if identity['user']['mustChangePassword']:
        handler._send_json({'error':'Troque sua senha inicial para continuar.'},403)
        return None
    return identity

def issue_session(handler,data_dir,user_id):
    key, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    with database(data_dir) as conn:
        old=cookie_value(handler,'ecargo_local_session')
        conn.execute('DELETE FROM local_sessions WHERE expires<=? OR key=?',(time.time(),digest(old)))
        conn.execute('INSERT INTO local_sessions VALUES (?,?,?,?)',(digest(key),user_id,csrf,time.time()+SESSION_TTL))
        user=public_user(conn.execute('SELECT * FROM local_users WHERE id=?',(user_id,)).fetchone())
    respond(handler,{'user':user,'csrfToken':csrf},cookies=[cookie_header('ecargo_local_session',key,SESSION_TTL)])

def json_body(handler):
    length=int(handler.headers.get('Content-Length','0') or 0)
    if length<0 or length>16000:
        raise ValueError('Requisição muito grande.')
    payload=json.loads(handler.rfile.read(length).decode() or '{}')
    if not isinstance(payload,dict):
        raise ValueError('Dados inválidos.')
    return payload

def handle_get(handler,path,data_dir,base_path):
    if path=='/api/auth/session':
        identity=session(handler,data_dir)
        with database(data_dir) as conn:
            setup=not bool(conn.execute('SELECT 1 FROM local_users LIMIT 1').fetchone())
        token=identity['csrfToken'] if identity else secrets.token_urlsafe(32)
        respond(handler,{'configured':True,'setupRequired':setup,'user':identity['user'] if identity else None,'csrfToken':token},cookies=[] if identity else [cookie_header('ecargo_preauth',token,3600)])
        return True
    if path not in {'/api/auth/users','/api/auth/notifications'}:
        return False
    identity=require_read(handler,data_dir)
    if not identity: return True
    with database(data_dir) as conn:
        if path.endswith('/users'):
            admin=identity['user']['role']=='admin'
            rows=conn.execute('SELECT * FROM local_users'+('' if admin else ' WHERE active=1')+' ORDER BY name').fetchall()
            result=[public_user(row) for row in rows]
        else:
            rows=conn.execute('SELECT payload,seen FROM auth_notifications WHERE user_id=? ORDER BY rowid DESC LIMIT 100',(identity['user']['id'],)).fetchall()
            result=[{**json.loads(row['payload']),'seen':bool(row['seen'])} for row in rows]
    handler._send_json(result)
    return True

def handle_post(handler,path,data_dir,base_path):
    if not path.startswith('/api/auth/'):
        return False
    try:
        if path=='/api/auth/login':
            token=cookie_value(handler,'ecargo_preauth')
            supplied=handler.headers.get('X-CSRF-Token','')
            if len(token)<32 or not secrets.compare_digest(token,supplied):
                respond(handler,{'error':'Atualize a página antes de entrar.'},403)
                return True
            payload=json_body(handler)
            email=str(payload.get('email','')).strip().casefold()
            password=payload.get('password','')
            ip=handler.client_address[0]
            keys=[digest(ip+'|'+email),digest('ip|'+ip)]
            now=time.time()
            with database(data_dir) as conn:
                conn.execute('DELETE FROM login_attempts WHERE expires<=?',(now,))
                attempts=[conn.execute('SELECT count FROM login_attempts WHERE key=?',(key,)).fetchone() for key in keys]
                if any(row and row['count']>=limit for row,limit in zip(attempts,[5,30])):
                    respond(handler,{'error':'Muitas tentativas. Tente novamente em 15 minutos.'},429)
                    return True
                row=conn.execute('SELECT * FROM local_users WHERE email=?',(email,)).fetchone()
                valid=verify_password(password,row['password_hash'] if row else DUMMY_HASH)
                if not row or not valid or not row['active']:
                    for key in keys:
                        conn.execute('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',(key,now+900))
                    respond(handler,{'error':'E-mail ou senha inválidos.'},401)
                    return True
                conn.execute('DELETE FROM login_attempts WHERE key=?',(keys[0],))
            issue_session(handler,data_dir,row['id'])
            return True
        allowed=path in {'/api/auth/logout','/api/auth/password','/api/auth/users','/api/auth/notifications/read'} or bool(re.fullmatch(r'/api/auth/users/[^/]+/(reset-password|update)',path))
        if not allowed:
            handler._send_json({'error':'Rota não encontrada.'},404)
            return True
        identity=require_write(handler,data_dir,allow_password_change=path in {'/api/auth/password','/api/auth/logout'},admin='/users' in path)
        if not identity: return True
        if path=='/api/auth/logout':
            with database(data_dir) as conn:
                conn.execute('DELETE FROM local_sessions WHERE key=?',(digest(cookie_value(handler,'ecargo_local_session')),))
            respond(handler,{'ok':True},cookies=[cookie_header('ecargo_local_session','',0)])
        elif path=='/api/auth/password':
            payload=json_body(handler)
            new=payload.get('newPassword','')
            validate_password(new)
            with database(data_dir) as conn:
                row=conn.execute('SELECT * FROM local_users WHERE id=?',(identity['user']['id'],)).fetchone()
                if not verify_password(payload.get('currentPassword',''),row['password_hash']):
                    raise ValueError('Senha atual incorreta.')
                if verify_password(new,row['password_hash']):
                    raise ValueError('A nova senha deve ser diferente da anterior.')
                conn.execute('UPDATE local_users SET password_hash=?,must_change=0 WHERE id=?',(hash_password(new),row['id']))
                conn.execute('DELETE FROM local_sessions WHERE user_id=?',(row['id'],))
            issue_session(handler,data_dir,identity['user']['id'])
        elif path=='/api/auth/users':
            payload=json_body(handler)
            password=secrets.token_urlsafe(18)
            user=create_user(data_dir,payload.get('name',''),payload.get('email',''),password,payload.get('role','collaborator'))
            respond(handler,{'user':user,'initialPassword':password},201)
        elif path.endswith('/reset-password'):
            user_id=path.split('/')[-2]
            if user_id==identity['user']['id']:
                raise ValueError('Use Trocar senha para alterar sua própria senha.')
            password=secrets.token_urlsafe(18)
            with database(data_dir) as conn:
                if not conn.execute('SELECT 1 FROM local_users WHERE id=?',(user_id,)).fetchone():
                    respond(handler,{'error':'Usuário não encontrado.'},404)
                    return True
                conn.execute('UPDATE local_users SET password_hash=?,must_change=1 WHERE id=?',(hash_password(password),user_id))
                conn.execute('DELETE FROM local_sessions WHERE user_id=?',(user_id,))
            respond(handler,{'initialPassword':password})
        elif path.endswith('/update'):
            user_id=path.split('/')[-2]
            payload=json_body(handler)
            role=payload.get('role')
            active=payload.get('active')
            if role not in {'admin','collaborator'} or not isinstance(active,bool):
                raise ValueError('Perfil ou situação inválidos.')
            with database(data_dir) as conn:
                conn.execute('BEGIN IMMEDIATE')
                row=conn.execute('SELECT * FROM local_users WHERE id=?',(user_id,)).fetchone()
                if not row:
                    respond(handler,{'error':'Usuário não encontrado.'},404)
                    return True
                admins=conn.execute("SELECT COUNT(*) FROM local_users WHERE role='admin' AND active=1").fetchone()[0]
                if row['role']=='admin' and row['active'] and admins<=1 and (role!='admin' or not active):
                    raise ValueError('É necessário manter pelo menos um administrador ativo.')
                conn.execute('UPDATE local_users SET role=?,active=? WHERE id=?',(role,int(active),user_id))
                conn.execute('DELETE FROM local_sessions WHERE user_id=?',(user_id,))
            respond(handler,{'ok':True})
        else:
            with database(data_dir) as conn:
                conn.execute('UPDATE auth_notifications SET seen=1 WHERE user_id=?',(identity['user']['id'],))
            respond(handler,{'ok':True})
    except (ValueError,TypeError) as exc:
        respond(handler,{'error':str(exc)},400)
    return True

def notify(data_dir,item,project,entry,recipients):
    with database(data_dir) as conn:
        for user_id in set(recipients)-{entry['authorId']}:
            if not conn.execute('SELECT 1 FROM local_users WHERE id=? AND active=1',(user_id,)).fetchone(): continue
            notification_id=uuid.uuid4().hex
            payload={'id':notification_id,'projectId':project['id'],'itemId':item['id'],'title':item['title'],'author':entry['author'],'text':entry['text'][:180],'createdAt':entry['createdAt']}
            conn.execute('INSERT INTO auth_notifications (id,user_id,payload) VALUES (?,?,?)',(notification_id,user_id,json.dumps(payload)))
