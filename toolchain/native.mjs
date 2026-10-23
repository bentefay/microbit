import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const entries = JSON.parse(fs.readFileSync('/opt/pxt/native-lock.json', 'utf8'));
for (const entry of entries) {
  const dir = entry.name === 'samples' ? '/opt/native' : `/opt/native/libraries/${entry.name === 'target' ? 'codal-microbit-v2' : entry.name}`;
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('remote', 'add', 'origin', `https://github.com/${entry.repo}`);
  git('fetch', '--depth=1', 'origin', entry.rev);
  git('checkout', '--detach', 'FETCH_HEAD');
  if (git('rev-parse', 'HEAD').toString().trim() !== entry.rev) throw new Error(`Revision mismatch: ${entry.name}`);
  if (entry.tag) git('tag', '-f', entry.tag);
  git('submodule', 'update', '--init', '--recursive');
  console.log(`Native source ${entry.name}: ${entry.rev}`);
}
