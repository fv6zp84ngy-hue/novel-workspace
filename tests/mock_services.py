#!/usr/bin/env python3
"""Synthetic service transport for UI tests. NEVER connects to the Internet."""
import argparse
import json
from pathlib import Path
import sys
from functools import partial
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import gateway
import serve
remote_files={}

def fixture_transport(method,url,body=None,headers=None):
    global remote_file,revision
    if not url.startswith('https://example.com/'):
        raise gateway.GatewayError('Fixture server accepts example.com only; no network is used')
    if url.endswith('/embeddings'):
        request=json.loads(body)
        return 200,{},json.dumps({'data':[{'index':i,'embedding':[1,0.5,0.25]} for i,_ in enumerate(request['input'])],'usage':{'total_tokens':10}}).encode()
    if url.endswith('/chat/completions'):
        request=json.loads(body);system=request['messages'][0]['content']
        text=json.dumps({'category':'character','reason':'合成分类测试结果'},ensure_ascii=False) if 'category' in system else ('合成草稿：灯塔的门终于打开了。' if '原创小说' in system else '合成问答：资料中存在人物线索。[S1]')
        return 200,{},json.dumps({'choices':[{'message':{'content':text}}],'usage':{'total_tokens':20}}).encode()
    if url.endswith('.json'):
        row=remote_files.get(url)
        if method=='GET':
            if row is None:return 404,{},b''
            etag='"fixture-'+str(row[0])+'"'
            if (headers or {}).get('If-None-Match')==etag:return 304,{'etag':etag},b''
            return 200,{'etag':etag},row[1]
        if method=='PUT':
            etag='"fixture-'+str(row[0])+'"' if row else None
            if (headers.get('If-None-Match')=='*' and row is not None) or ('If-Match' in headers and headers['If-Match']!=etag):return 412,{},b''
            revision=(row[0]+1) if row else 1
            remote_files[url]=(revision,body)
            return 201,{'etag':'"fixture-'+str(revision)+'"'},b''
    raise gateway.GatewayError('Unknown synthetic fixture route')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8772);args=parser.parse_args()
    gateway.remote=fixture_transport
    serve.PUBLIC_FILES=set(json.loads((serve.ROOT/'release-manifest.json').read_text())['files'])
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(serve.Handler,directory=str(serve.ROOT)))
    print('SYNTHETIC SERVICES ONLY — no real AI, WebDAV or billing. Open /?qa=1',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
