"""Lock-time only: resolve pinned Hugging Face asset hashes. Prints JSON."""
import hashlib
import json
import sys
import urllib.request

repo, files = sys.argv[1], sys.argv[2:]
api = f'https://huggingface.co/api/models/{repo}'


def get(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


revision = json.loads(get(api))['sha']
tree = {e['path']: e for e in json.loads(get(f'{api}/tree/{revision}?recursive=true'))}
assets = []
for path in files:
    entry = tree.get(path)
    if entry is None or entry['type'] != 'file':
        raise RuntimeError(f'Missing {path} at {revision}')
    url = f'https://huggingface.co/{repo}/resolve/{revision}/{path}'
    if 'lfs' in entry:
        sha256, size = entry['lfs']['oid'], entry['lfs']['size']
    else:
        data = get(url)  # Small git-tracked files carry no SHA-256 in the tree API.
        sha256, size = hashlib.sha256(data).hexdigest(), len(data)
    assets.append({'path': path, 'url': url, 'sha256': sha256, 'size_bytes': size})
print(json.dumps({'repository': repo, 'revision': revision, 'files': assets}, indent=2))
