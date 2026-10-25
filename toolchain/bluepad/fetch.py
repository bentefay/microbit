"""Image-only source preparation. Verify pinned archives before extracting."""
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request
import sys

root = Path('/opt/bluepad')
sdk = len(sys.argv) > 1 and sys.argv[1] == 'sdk'
sources = json.loads((root / ('sdk.json' if sdk else 'sources.json')).read_text())
if sdk:
    sources = sources['archives']
for source in sources:
    name = source['name']
    archive = root / (name + '.tar.gz')
    print('Downloading', name, source.get('revision', 'SDK'), flush=True)
    with urllib.request.urlopen(source['archive_url'], timeout=120) as response, archive.open('wb') as out:
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
    with archive.open('rb') as data:
        actual = hashlib.file_digest(data, 'sha256').hexdigest()
    if actual != source['archive_sha256'] or archive.stat().st_size != source['archive_size_bytes']:
        raise RuntimeError(f'Archive integrity mismatch: {name}')
    dest = Path(source['destination']) if sdk else root / ('modules' if name in ('cmsis', 'CMSIS_6', 'hal_nordic') else '') / name
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as contents:
        members = []
        for member in contents.getmembers():
            parts = member.name.split('/')[1:]
            if not parts or not parts[0]:
                continue
            if not sdk and parts[0].lower() in ('doc', 'docs', 'documentation', 'test', 'tests', '.github'):
                continue
            if name == 'zephyr' and parts[0] == 'samples':
                continue
            member.name = '/'.join(parts)
            # Hardlink targets are archive-root-relative; symlink targets are not.
            if member.islnk():
                member.linkname = '/'.join(member.linkname.split('/')[1:])
            members.append(member)
        contents.extractall(dest, members=members, filter='data')
    archive.unlink()
