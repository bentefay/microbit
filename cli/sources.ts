// Read-only upstream inspection; all requests are explicit CLI operations.
export const nativeSources = {
  samples: { repo: 'lancaster-university/microbit-v2-samples', ref: 'v0.2.13' },
  target: { repo: 'lancaster-university/codal-microbit-v2', ref: 'v0.3.5' },
};
export async function inspectSource(name: string, file = '') {
  const catalog = { ...nativeSources, core: { repo: 'microsoft/pxt', ref: 'af4bcc89fd2114b6ec232860ce0458cb9aa0dd28' } };
  const source = catalog[name as keyof typeof catalog];
  if (!source || file.includes('..')) throw new Error('Use source samples|target [repository/path]');
  const url = `https://api.github.com/repos/${source.repo}/contents/${file}?ref=${source.ref}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body: any = await response.json();
  console.log(Array.isArray(body) ? body.map(f => f.name).join('\n') : Buffer.from(body.content, 'base64').toString());
}

export async function lockNativeSources() {
  const get = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json() as Promise<any>;
  };
  const entries: any[] = [];
  for (const [name, source] of Object.entries(nativeSources)) {
    const commit = await get(`https://api.github.com/repos/${source.repo}/commits/${source.ref}`);
    entries.push({ name, repo: source.repo, rev: commit.sha, tag: source.ref });
  }
  const target = entries.find(e => e.name === 'target');
  const contents = await get(`https://api.github.com/repos/${target.repo}/contents/target-locked.json?ref=${target.rev}`);
  const config = JSON.parse(Buffer.from(contents.content, 'base64').toString());
  for (const lib of config.libraries) {
    if (!/^[a-f0-9]{40}$/.test(lib.branch) || !lib.url.startsWith('https://github.com/')) throw new Error('Unlocked native library');
    entries.push({ name: lib.name, repo: lib.url.slice('https://github.com/'.length), rev: lib.branch });
  }
  return entries;
}

export async function resolveCommit(repo: string, ref: string) {
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`);
  if (!response.ok) throw new Error(`Cannot resolve ${repo}@${ref}: ${response.status}`);
  const data: any = await response.json();
  if (!/^[a-f0-9]{40}$/.test(data.sha)) throw new Error('Expected a full Git commit');
  return data.sha as string;
}
