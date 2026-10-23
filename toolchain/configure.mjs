import fs from 'node:fs';
const root = '/opt/pxt/node_modules/pxt-microbit';
fs.writeFileSync('/opt/pxt/node_modules/pxtcli.json', JSON.stringify({ targetdir: 'pxt-microbit' }));
// Shared writable native cache for both CLI and the browser's local cache endpoint.
// Discard npm-bundled native binaries so local native compilation is testable.
fs.rmSync(`${root}/built/hexcache`, { recursive: true, force: true });
fs.symlinkSync('/workspace/built/hexcache', `${root}/built/hexcache`);
// V2-only workspace: do not invoke the obsolete V1/yotta toolchain.
for (const filename of ['pxtarget.json', 'built/target.json']) {
  const path = `${root}/${filename}`;
  if (!fs.existsSync(path)) continue;
  const target = JSON.parse(fs.readFileSync(path));
  if (filename === 'built/target.json') {
    // Browser file: dependencies are workspace-project references, unlike CLI paths.
    // Bundle the pinned extensions into this target so both use identical local sources.
    for (const name of ['pxt-nezha2', 'pxt-PlanetX', 'pxt-PlanetX-AI']) {
      const dir = `/opt/vendor/${name}`;
      const config = JSON.parse(fs.readFileSync(`${dir}/pxt.json`));
      if (config.dependencies['pxt-PlanetX-AI']) config.dependencies['pxt-PlanetX-AI'] = '*';
      const files = { 'pxt.json': JSON.stringify(config, null, 2) };
      for (const file of config.files) files[file] = fs.readFileSync(`${dir}/${file}`, 'utf8');
      target.bundledpkgs[name] = files;
    }
  }
  target.multiVariants = ['mbcodal'];
  target.alwaysMultiVariant = true;
  fs.writeFileSync(path, JSON.stringify(target, null, 2));
  if (filename === 'built/target.json') fs.writeFileSync(`${root}/built/target.js`, `var pxtTargetBundle = ${JSON.stringify(target)};`);
}
