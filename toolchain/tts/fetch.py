"""Image-only asset preparation. Verify pinned model files before use."""
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path('/opt/tts')
manifest = json.loads((root / 'assets.json').read_text())
for asset in manifest['files']:
    dest = root / 'assets' / asset['path']
    dest.parent.mkdir(parents=True, exist_ok=True)
    print('Downloading', asset['path'], manifest['revision'], flush=True)
    with urllib.request.urlopen(asset['url'], timeout=300) as response, dest.open('wb') as out:
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
    with dest.open('rb') as data:
        actual = hashlib.file_digest(data, 'sha256').hexdigest()
    if actual != asset['sha256'] or dest.stat().st_size != asset['size_bytes']:
        raise RuntimeError(f'Asset integrity mismatch: {asset["path"]}')
