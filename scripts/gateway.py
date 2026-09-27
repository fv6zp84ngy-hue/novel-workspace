"""Local-only BYOK gateway. Credentials stay in process memory; no redirects or logs."""
import base64
import http.client
import ipaddress
import json
import secrets
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit

MAX_BODY=56*1024*1024
SESSIONS={}
LOCK=threading.Lock()
class GatewayError(Exception):
    def __init__(self,message,status=400):super().__init__(message);self.status=status

def safe_url(url):
    if not isinstance(url,str) or len(url)>2048:raise GatewayError('Invalid service URL')
    p=urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443) or p.fragment or p.query or '\\' in url or any(ord(c)<33 for c in url):raise GatewayError('Only a public HTTPS URL on port 443 is supported')
    if p.hostname.lower()=='localhost' or p.hostname.lower().endswith(('.local','.localhost')):raise GatewayError('Private network endpoints are blocked')
    return p

def public_address(host):
    addresses=list({row[4][0] for row in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(x).is_global for x in addresses):raise GatewayError('Private or reserved network addresses are blocked')
    return addresses[0]

class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,address):super().__init__(host,443,timeout=45,context=ssl.create_default_context());self.address=address
    def connect(self):
        sock=socket.create_connection((self.address,443),timeout=self.timeout)
        self.sock=self._context.wrap_socket(sock,server_hostname=self.host)

def remote(method,url,body=None,headers=None):
    p=safe_url(url);conn=PinnedHTTPS(p.hostname,public_address(p.hostname))
    try:
        conn.request(method,p.path or '/',body=body,headers=headers or {})
        response=conn.getresponse();status=response.status
        data=response.read(MAX_BODY+1)
        if len(data)>MAX_BODY:raise GatewayError('Remote response exceeds limit',502)
        # Never follow redirects, including redirects to other HTTPS hosts.
        if 300<=status<400 and status!=304:raise GatewayError('Redirect refused; use the final service URL',502)
        return status,dict((k.lower(),v) for k,v in response.getheaders()),data
    except (OSError,http.client.HTTPException):raise GatewayError('Service connection failed or timed out',502) from None
    finally:conn.close()

def new_session():
    with LOCK:
        now=time.monotonic()
        for k in list(SESSIONS):
            if now-SESSIONS[k]['time']>3600:del SESSIONS[k]
        if len(SESSIONS)>=32:raise GatewayError('Too many local sessions',429)
        token=secrets.token_urlsafe(32);SESSIONS[token]={'time':now,'mutex':threading.Lock(),'calls':[],'config':{},'spent':0}
    return token

def session(token):
    with LOCK:
        s=SESSIONS.get(token)
        if not s or time.monotonic()-s['time']>3600:
            SESSIONS.pop(token,None);raise GatewayError('Session expired. Reconfigure services.',401)
        s['time']=time.monotonic();return s

def configure(s,data):
    base=data.get('base','').rstrip('/');safe_url(base)
    key=data.get('key','')
    if not isinstance(key,str) or not 8<=len(key)<=4096 or any(ord(c)<33 or ord(c)>126 for c in key):raise GatewayError('Invalid API key')
    config={'base':base,'key':key}
    for name in ['chatModel','embeddingModel']:
        value=data.get(name,'')
        if not isinstance(value,str) or not 1<=len(value)<=150 or any(ord(c)<32 for c in value):raise GatewayError('Enter model IDs provided by your service')
        config[name]=value
    limit=data.get('budget',50000)
    if not isinstance(limit,int) or not 1000<=limit<=500000:raise GatewayError('Session token ceiling must be between 1000 and 500000')
    config['budget']=limit
    # Reconfiguration must not reset measured spending.
    s['config']=config
    return {'configured':True,'host':urlsplit(base).hostname,'spent':s['spent'],'budget':limit}

def ai_call(s,data):
    c=s['config']
    if not c:raise GatewayError('Configure your own model account first')
    now=time.monotonic();s['calls']=[t for t in s['calls'] if now-t<60]
    if len(s['calls'])>=10:raise GatewayError('At most 10 model calls per minute',429)
    kind=data.get('kind')
    if kind=='embeddings':
        inputs=data.get('input')
        if not isinstance(inputs,list) or not 1<=len(inputs)<=16 or any(not isinstance(x,str) or len(x)>2400 for x in inputs) or sum(len(x) for x in inputs)>18000:raise GatewayError('Embedding batch exceeds limit')
        payload={'model':c['embeddingModel'],'input':inputs};path='/embeddings';reserve=sum(len(x.encode()) for x in inputs)+len(inputs)*32
    elif kind=='chat':
        messages=data.get('messages');max_tokens=data.get('max_tokens',800)
        if not isinstance(messages,list) or not 1<=len(messages)<=8 or any(not isinstance(x,dict) or x.get('role') not in ('system','user','assistant') or not isinstance(x.get('content'),str) for x in messages):raise GatewayError('Invalid messages')
        if sum(len(x['content']) for x in messages)>20000 or not isinstance(max_tokens,int) or not 1<=max_tokens<=2000:raise GatewayError('Request exceeds context/output limit')
        payload={'model':c['chatModel'],'messages':[{'role':x['role'],'content':x['content']} for x in messages],'max_tokens':max_tokens,'temperature':0.2};path='/chat/completions';reserve=sum(len(x['content'].encode()) for x in messages)+len(messages)*32+max_tokens
    else:raise GatewayError('Unsupported operation')
    if s['spent']+reserve>c['budget']:raise GatewayError('Local session budget would be exceeded; review your provider budget first',429)
    # Reserve conservatively before dispatch. Uncertain network failures retain reservation.
    s['spent']+=reserve;s['calls'].append(now)
    status,headers,raw=remote('POST',c['base']+path,json.dumps(payload).encode(),{'Authorization':'Bearer '+c['key'],'Content-Type':'application/json'})
    if status!=200:raise GatewayError('Model service rejected request (HTTP '+str(status)+'); check model access, quota and account billing',502)
    try:result=json.loads(raw)
    except (ValueError,UnicodeError):raise GatewayError('Invalid model response',502) from None
    if not isinstance(result,dict):raise GatewayError('Invalid model response',502)
    usage=result.get('usage',{});measured=usage.get('total_tokens') if isinstance(usage,dict) else None
    if type(measured) is int and measured>=0:s['spent']+=measured-reserve
    result['local_budget']={'spent':s['spent'],'limit':c['budget'],'measured':type(measured) is int and measured>=0}
    return result

def validate_envelope(value):
    if not isinstance(value,dict) or set(value)!={'format','version','kdf','iterations','salt','iv','ciphertext'} or value.get('format')!='novel-encrypted' or value.get('version')!=1 or value.get('kdf')!='PBKDF2-SHA256' or value.get('iterations')!=600000:raise GatewayError('Only encrypted snapshots may be uploaded')
    try:
        salt,iv,cipher=(base64.b64decode(value[k],validate=True) for k in ('salt','iv','ciphertext'))
        if len(salt)!=16 or len(iv)!=12 or not 16<=len(cipher)<=40*1024*1024+16:raise ValueError()
    except (ValueError,TypeError):raise GatewayError('Invalid encrypted envelope') from None

def purge_sessions():
    with LOCK:
        expired=[k for k,s in SESSIONS.items() if time.monotonic()-s['time']>3600]
        for k in expired:del SESSIONS[k]


def dav_call(s,data):
    url=data.get('url');safe_url(url)
    auth=data.get('authorization','')
    if not isinstance(auth,str) or not auth.startswith(('Basic ','Bearer ')) or len(auth)>8192 or any(ord(c)<32 or ord(c)>126 for c in auth):raise GatewayError('Invalid WebDAV credentials')
    op=data.get('operation')
    headers={'Authorization':auth};body=None
    if op=='read':
        method='GET'
        seen=data.get('ifNoneMatch')
        if seen is not None:
            if not isinstance(seen,str) or not seen.startswith('\"') or not seen.endswith('\"') or len(seen)>512 or '\n' in seen or '\r' in seen:raise GatewayError('A strong ETag is required')
            headers['If-None-Match']=seen
    elif op=='write':
        method='PUT';envelope=data.get('envelope')
        validate_envelope(envelope)
        body=json.dumps(envelope).encode()
        if len(body)>MAX_BODY:raise GatewayError('Encrypted snapshot too large')
        match=data.get('etag')
        if match is None:headers['If-None-Match']='*'
        elif isinstance(match,str) and match.startswith('"') and match.endswith('"') and len(match)<=512 and '\n' not in match and '\r' not in match:headers['If-Match']=match
        else:raise GatewayError('A strong ETag is required to avoid overwriting changes')
        headers['Content-Type']='application/json'
    else:raise GatewayError('Unsupported WebDAV action')
    status,reply,raw=remote(method,url,body,headers)
    if status==412:raise GatewayError('Remote snapshot changed. Download and review it before uploading.',409)
    if status==404 and op=='read':return {'exists':False,'etag':None}
    if status==304 and op=='read':return {'exists':True,'unchanged':True,'etag':data.get('ifNoneMatch')}
    if status not in (200,201,204):raise GatewayError('WebDAV request failed (HTTP '+str(status)+')',502)
    if op=='write':return {'saved':True,'etag':reply.get('etag')}
    etag=reply.get('etag')
    if not etag or etag.startswith('W/'):raise GatewayError('This WebDAV server does not provide a strong ETag; safe overwrite is unavailable',502)
    try:envelope=json.loads(raw)
    except (ValueError,UnicodeError):raise GatewayError('Remote snapshot is not JSON',502) from None
    if not isinstance(envelope,dict) or envelope.get('format')!='novel-encrypted':raise GatewayError('Remote file is not an encrypted workspace',502)
    return {'exists':True,'etag':etag,'envelope':envelope}

def dispatch(token,path,data):
    s=session(token)
    if not s['mutex'].acquire(blocking=False):raise GatewayError('Another service request is running',409)
    try:
        if path=='/api/config':return configure(s,data)
        if path=='/api/ai':return ai_call(s,data)
        if path=='/api/dav':return dav_call(s,data)
        if path=='/api/forget':
            with LOCK:SESSIONS.pop(token,None)
            return {'forgotten':True}
        raise GatewayError('Unknown route',404)
    finally:s['mutex'].release()
