#!/usr/bin/env python3
"""Loopback-only static server with an explicit public-file allowlist."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from gateway import GatewayError, new_session, dispatch, MAX_BODY, purge_sessions
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

def public_path(url, root, allowed):
    path = unquote(urlsplit(url).path)
    if '\\' in path or '\x00' in path:
        return None
    parts = path.lstrip('/').split('/')
    if any(p in ('.', '..') or p.startswith('.') for p in parts if p):
        return None
    name = '/'.join(parts) or 'index.html'
    if name not in allowed:
        return None
    target = root / name
    if any(p.is_symlink() for p in [target, *target.parents] if p.is_relative_to(root)):
        return None
    if not target.resolve().is_relative_to(root.resolve()) or not target.is_file():
        return None
    return target

class Handler(SimpleHTTPRequestHandler):
    def api_reply(self, status, data):
        body=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        host='127.0.0.1:'+str(self.server.server_port)
        if self.headers.get('Host')!=host or self.headers.get('Origin')!='http://'+host or self.headers.get('Content-Type')!='application/json':
            self.api_reply(403,{'error':'Only the local application may use this gateway'})
            return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<2 or size>(MAX_BODY if self.path=='/api/dav' else 100000):raise GatewayError('Request size is invalid',413)
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise GatewayError('JSON object required')
            if self.path=='/api/session':result={'token':new_session()}
            else:result=dispatch(self.headers.get('X-Workspace-Session',''),self.path,data)
            self.api_reply(200,result)
        except GatewayError as error:self.api_reply(error.status,{'error':str(error)})
        except Exception:self.api_reply(400,{'error':'Request failed; no credentials are logged'})

    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def log_message(self, format, *args):
        pass

    def permitted(self):
        return public_path(self.path, ROOT, PUBLIC_FILES) is not None

    def do_GET(self):
        if not self.permitted():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.permitted():
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        super().end_headers()

if __name__ == '__main__':
    PUBLIC_FILES = set(json.loads((ROOT / 'release-manifest.json').read_text())['files'])
    parser = argparse.ArgumentParser(description='Start Novel Workspace locally')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    def expire_sessions():
        while True:
            time.sleep(60)
            purge_sessions()
    threading.Thread(target=expire_sessions,daemon=True).start()
    print(f'Novel Workspace: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
