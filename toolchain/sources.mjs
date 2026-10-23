// All extension downloads occur as an explicit Docker image build step.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const versions = JSON.parse(fs.readFileSync('/opt/pxt/versions.json'));
fs.mkdirSync('/opt/vendor', { recursive: true });
for (const [name, source] of Object.entries(versions.sources)) {
  if (!/^[a-f0-9]{40}$/.test(source.rev)) throw new Error(`Expected a full commit for ${name}; use run deps lock-vendors`);
  const dest = `/opt/vendor/${name}`;
  execFileSync('git', ['init', dest]);
  execFileSync('git', ['-C', dest, 'remote', 'add', 'origin', `https://github.com/${source.repo}.git`]);
  execFileSync('git', ['-C', dest, 'fetch', '--depth=1', 'origin', source.rev], { stdio: 'inherit' });
  execFileSync('git', ['-C', dest, 'checkout', '--detach', 'FETCH_HEAD']);
  const actual = execFileSync('git', ['-C', dest, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actual !== source.rev) throw new Error(`Source mismatch for ${name}`);
  fs.rmSync(`${dest}/.git`, { recursive: true });
}
// Resolve the transitive extension locally, preserving the upstream source.
const manifest = '/opt/vendor/pxt-PlanetX/pxt.json';
const pkg = JSON.parse(fs.readFileSync(manifest));
pkg.dependencies['pxt-PlanetX-AI'] = 'file:../pxt-PlanetX-AI';
fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2));
