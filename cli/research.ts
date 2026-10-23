import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Read-only public source inspection. Saves evidence; never executes downloads. */
export async function research(root: string, address: string, match?: string) {
  const url = new URL(address);
  const hosts = ['api.github.com', 'raw.githubusercontent.com', 'wiki.elecfreaks.com', 'www.elecfreaks.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password)
    throw new Error('Research accepts public HTTPS GitHub source/API or ELECFREAKS documentation URLs');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const raw = await response.text();
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const directory = join(root, '.cache/research');
  await mkdir(directory, { recursive: true });
  const evidence = createHash('sha256').update(url.href + '\n' + raw).digest('hex');
  await writeFile(join(directory, `${evidence}.json`), JSON.stringify({ url: url.href, retrieved: new Date().toISOString(), sha256, body: raw }, null, 2) + '\n');
  let body = raw;
  try { body = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
  const lines = body.split('\n');
  const selected = new Set<number>();
  if (match) lines.forEach((line, index) => {
    if (line.toLowerCase().includes(match.toLowerCase()))
      for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 5); i++) selected.add(i);
  });
  console.error(`Source: ${url}\nEvidence: .cache/research/${evidence}.json`);
  console.log(match ? [...selected].sort((a, b) => a - b).map(i => `${i + 1}: ${lines[i]}`).join('\n') || 'No matching lines' : body);
}
