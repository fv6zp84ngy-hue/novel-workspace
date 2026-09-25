"""Validate release paths before reading or copying any file."""
import json
from pathlib import PurePosixPath
import re

def release_files(root):
    version = (root/'VERSION').read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    files = json.loads((root/'release-manifest.json').read_text())['files']
    if not isinstance(files, list) or not all(isinstance(n, str) for n in files) or len(files) != len(set(files)):
        raise ValueError('Invalid or duplicate release paths')
    for name in files:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or str(path) != name or '\\' in name:
            raise ValueError('Unsafe release path')
        if any(p in ('.git','dist','node_modules','data','backups','exports','runtime','__pycache__') for p in path.parts):
            raise ValueError('Private/generated release path')
        target = root/name
        if any(p.is_symlink() for p in [target,*target.parents] if p.is_relative_to(root)) or not target.is_file() or not target.resolve().is_relative_to(root.resolve()):
            raise ValueError('Missing file or symlink in release')
    return version, sorted(files)
