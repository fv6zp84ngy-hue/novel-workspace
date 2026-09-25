"""Synthetic protocol/failure tests. No network requests or real credentials."""
import base64
import io
import json
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import gateway as g
import serve

class GatewayTests(unittest.TestCase):
    def setUp(self):
        g.SESSIONS.clear();self.token=g.new_session();self.s=g.session(self.token)
        g.configure(self.s,{'base':'https://example.com/v1','key':'synthetic-fixture','chatModel':'fixture-chat','embeddingModel':'fixture-vector','budget':1000})
    def test_private_destinations_and_url_credentials(self):
        for url in ['http://example.com','https://localhost/a','https://example.com:8080/a','https://user:pass'+'@'+'example.com','https://example.com/?key=fixture']:
            with self.assertRaises(g.GatewayError):g.safe_url(url)
        with patch.object(g.socket,'getaddrinfo',return_value=[(0,0,0,'',('127.0.0.1',443))]):
            with self.assertRaises(g.GatewayError):g.public_address('example.com')
    def test_ambiguous_failure_consumes_reservation_and_no_retry(self):
        with patch.object(g,'remote',side_effect=g.GatewayError('timeout',502)) as remote:
            with self.assertRaises(g.GatewayError):g.ai_call(self.s,{'kind':'embeddings','input':['test']})
            self.assertEqual(remote.call_count,1);self.assertEqual(self.s['spent'],36)
    def test_budget_and_actual_usage(self):
        with patch.object(g,'remote',return_value=(200,{},json.dumps({'usage':{'total_tokens':7},'data':[]}).encode())) as remote:
            result=g.ai_call(self.s,{'kind':'embeddings','input':['test']});self.assertEqual(result['local_budget']['spent'],7)
            with self.assertRaises(g.GatewayError):g.ai_call(self.s,{'kind':'chat','messages':[{'role':'user','content':'x'}],'max_tokens':1500})
            self.assertEqual(remote.call_count,1)
    def envelope(self):
        return dict(format='novel-encrypted',version=1,kdf='PBKDF2-SHA256',iterations=600000,salt=base64.b64encode(b'0'*16).decode(),iv=base64.b64encode(b'1'*12).decode(),ciphertext=base64.b64encode(b'2'*16).decode())
    def test_dav_conditional_create_and_conflict(self):
        data={'url':'https://example.com/novel.json','authorization':'Basic fixture','operation':'write','envelope':self.envelope()}
        with patch.object(g,'remote',return_value=(201,{},b'')) as remote:
            g.dav_call(self.s,data);self.assertEqual(remote.call_args.args[3]['If-None-Match'],'*')
        with patch.object(g,'remote',return_value=(412,{},b'')) as remote:
            with self.assertRaises(g.GatewayError) as error:g.dav_call(self.s,{**data,'etag':'"v1"'})
            self.assertEqual(error.exception.status,409);self.assertEqual(remote.call_args.args[3]['If-Match'],'"v1"')
        with self.assertRaises(g.GatewayError):g.dav_call(self.s,{**data,'envelope':{**self.envelope(),'plaintext':'must not upload'}})
    def test_conditional_read_304(self):
        with patch.object(g,'remote',return_value=(304,{'etag':'"v1"'},b'')) as remote:
            result=g.dav_call(self.s,{'url':'https://example.com/a','authorization':'Basic fixture','operation':'read','ifNoneMatch':'"v1"'})
            self.assertTrue(result['unchanged']);self.assertEqual(remote.call_args.args[3]['If-None-Match'],'"v1"')
    def test_weak_etag_refused(self):
        with patch.object(g,'remote',return_value=(200,{'etag':'W/"v1"'},b'{}')):
            with self.assertRaises(g.GatewayError):g.dav_call(self.s,{'url':'https://example.com/a','authorization':'Basic fixture','operation':'read'})
    def test_conditional_304_is_not_redirected(self):
        with patch.object(g,'public_address',return_value='93.184.216.34'),patch.object(g,'PinnedHTTPS') as connection:
            response=connection.return_value.getresponse.return_value;response.status=304;response.read.return_value=b'';response.getheaders.return_value=[('ETag','"v1"')]
            status,headers,body=g.remote('GET','https://example.com/a')
            self.assertEqual(status,304);self.assertEqual(headers['etag'],'"v1"')
    def test_redirect_refused(self):
        with patch.object(g,'public_address',return_value='93.184.216.34'),patch.object(g,'PinnedHTTPS') as connection:
            response=connection.return_value.getresponse.return_value;response.status=302;response.read.return_value=b''
            with self.assertRaises(g.GatewayError):g.remote('GET','https://example.com/a')
            self.assertEqual(connection.return_value.request.call_count,1)
    def test_expiry_and_forget(self):
        g.dispatch(self.token,'/api/forget',{})
        with self.assertRaises(g.GatewayError):g.session(self.token)
        token=g.new_session();g.SESSIONS[token]['time']-=3700;g.purge_sessions();self.assertNotIn(token,g.SESSIONS)
    def test_origin_host_and_type_gate(self):
        class Request:
            server=type('Server',(),{'server_port':8771})()
            def api_reply(self,status,data):self.result=status
        for headers in [{},{'Host':'127.0.0.1:8771','Origin':'https://example.com','Content-Type':'application/json'},{'Host':'evil.example:8771','Origin':'http://127.0.0.1:8771','Content-Type':'application/json'}]:
            req=Request();req.headers=headers;serve.Handler.do_POST(req);self.assertEqual(req.result,403)
    def test_successful_origin_session(self):
        class Request:
            server=type('Server',(),{'server_port':8771})();path='/api/session';rfile=io.BytesIO(b'{}')
            headers={'Host':'127.0.0.1:8771','Origin':'http://127.0.0.1:8771','Content-Type':'application/json','Content-Length':'2'}
            def api_reply(self,status,data):self.result=(status,data)
        req=Request();serve.Handler.do_POST(req);self.assertEqual(req.result[0],200);self.assertIn(req.result[1]['token'],g.SESSIONS)

if __name__=='__main__':unittest.main()
