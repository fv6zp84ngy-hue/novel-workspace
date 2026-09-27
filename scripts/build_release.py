#!/usr/bin/env python3
"""Build full offline-ready packages from an explicit public-file allowlist."""
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
    dest.chmod(0o755 if filename in ('Start.command', 'Start.sh') else 0o644)
checksums = []
for archive, prefix in ((dist / (name + '.zip'), name + '/'), (dist / 'novel-workspace-latest.zip', '')):
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
        for filename in files:
            info = zipfile.ZipInfo(prefix + filename, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o100755 if filename in ('Start.command', 'Start.sh') else 0o100644
            info.external_attr = mode << 16
            out.writestr(info, (ROOT / filename).read_bytes())
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksums.append(f'{checksum}  {archive.name}')
    print(f'Built {archive}\nSHA-256 {checksum}')
(dist / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
print(f'{len(files)} allowlisted files per archive; latest ZIP has root-level files for overwrite upgrades.')
