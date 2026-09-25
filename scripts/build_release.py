#!/usr/bin/env python3
"""Build a source-only directory and reproducible zip from an explicit allowlist."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from release_files import release_files

ROOT = Path(__file__).resolve().parents[1]
version, files = release_files(ROOT)
dist = ROOT / 'dist'
name = 'novel-workspace-' + version
folder = dist / name
folder.mkdir(parents=True, exist_ok=True)
existing = {str(p.relative_to(folder)) for p in folder.rglob('*') if p.is_file()}
if existing - set(files):
    raise SystemExit('Release directory contains unexpected files; use a clean destination before rebuilding.')
for filename in files:
    src = ROOT / filename
    if src.is_symlink() or not src.is_file() or not src.resolve().is_relative_to(ROOT):
        raise SystemExit('Unsafe or missing release file: ' + filename)
    dest = folder / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
archive = dist / (name + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
    for filename in files:
        info = zipfile.ZipInfo(name + '/' + filename, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        out.writestr(info, (ROOT / filename).read_bytes())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(dist / 'SHA256SUMS').write_text(f'{checksum}  {archive.name}\n')
print(f'Built {folder}\nBuilt {archive}\nSHA-256 {checksum}\n{len(files)} allowlisted files; no Git history or browser data included.')
