#!/usr/bin/env python3
"""Offline release checks. No uploads and no third-party scanner dependencies."""
from pathlib import Path
import json
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit
from release_files import release_files
ROOT = Path(__file__).resolve().parents[1]
version, files = release_files(ROOT)
# Split literals so the denylist does not match its own implementation.
private_terms = ['abo'+'arding','first'+'-value-studio','First '+'Value Studio','lab'+'.html','/'+'Users/']
patterns = [r'gh[pousr]_[A-Za-z0-9]{20,}',r'github_pat_[A-Za-z0-9_]{20,}',r'sk-[A-Za-z0-9_-]{24,}',r'AKIA[A-Z0-9]{16}',r'-----BEGIN [A-Z ]*PRIVATE KEY-----',r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}']
for name in files:
    path=ROOT/name
    text=path.read_text()
    scan=text.replace('kevin.jahns'+'@'+'protonmail.com','') if name=='THIRD_PARTY_LICENSES.md' else text
    if any(term.lower() in (name+'\n'+scan).lower() for term in private_terms) or any(re.search(pattern,scan) for pattern in patterns):
        raise SystemExit('Sensitive or excluded content in '+name)
    if path.suffix in ('.js','.mjs'):
        subprocess.run(['node','--check',str(path)],check=True)
    if path.suffix in ('.md','.html'):
        links=re.findall(r'\]\(([^)]+)\)',text) if path.suffix=='.md' else re.findall(r'(?:href|src)=["\']([^"\']+)["\']',text)
        for link in links:
            target=urlsplit(link.strip('<>'))
            if target.scheme or not target.path or target.path.startswith('/'):
                continue
            dest=path.parent/unquote(target.path)
            if dest.is_dir():
                dest=dest/'index.html'
            if not dest.is_file() or not dest.resolve().is_relative_to(ROOT):
                raise SystemExit('Broken local file link in '+name)
project = json.loads((ROOT/'docs/PROJECT.json').read_text(encoding='utf-8'))
if project.get('project',{}).get('version') != version:
    raise SystemExit('PROJECT.json version does not match VERSION')
subprocess.run(['node','--test','tests/core.test.mjs','tests/advanced.test.mjs','tests/live.test.mjs','tests/funnel.test.mjs'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'-B','tests/server_test.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'-B','tests/gateway_test.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'-B','tests/analyze_funnel_test.py'],cwd=ROOT,check=True)
print(f'PASS: {len(files)} public files, syntax, links, release hygiene, metadata and core tests')
print('Run tests/browser.html separately for real IndexedDB integration.')
