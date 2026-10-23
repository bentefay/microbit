import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const packages = Object.fromEntries(execFileSync('dpkg-query', ['-W', '-f=${binary:Package}\t${Version}\n'], { encoding: 'utf8' })
  .trim().split('\n').map(line => line.split('\t')));
if (process.argv[2] === 'print') console.log(JSON.stringify(packages, null, 2));
else {
  const expected = JSON.parse(fs.readFileSync('/opt/pxt/system-lock.json', 'utf8'));
  for (const [name, version] of Object.entries(expected)) {
    if (packages[name] !== version) throw new Error(`System package drift: ${name}: expected ${version}, found ${packages[name]}`);
  }
  if (!Object.keys(expected).length) console.log('System manifest not yet initialized; use run image lock-system after bootstrap.');
}
