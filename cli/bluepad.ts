import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const image = 'microbit-bluepad:local';
const armTool = '/opt/zephyr-sdk/gnu/arm-zephyr-eabi/bin/arm-zephyr-eabi-';
type Command = (argv: string[], capture?: boolean) => Promise<string>;
async function recipeHash(root: string) {
  const hash = createHash('sha256');
  for (const file of ['toolchain/bluepad/Dockerfile', 'toolchain/bluepad/fetch.py',
    'toolchain/bluepad/sources.json', 'toolchain/bluepad/system-lock.json',
    'toolchain/bluepad/sdk.json',
    'toolchain/bluepad/versions.json', 'toolchain/system-lock.mjs']) {
    hash.update(file).update(await readFile(join(root, file)));
  }
  return hash.digest('hex');
}
export function bluepadArgs(root: string, output: string) {
  return ['--rm', '--init', '--user', `${process.getuid!()}:${process.getgid!()}`,
    '--network', 'none', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only',
    '--pids-limit', '256', '--memory', '4g', '--cpus', '4',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '-e', 'XDG_CACHE_HOME=/tmp/cache',
    '-e', 'PYTHONDONTWRITEBYTECODE=1',
    '--mount', `type=bind,src=${join(root, 'workspace/projects/bluepad')},dst=/app,readonly`,
    '--mount', `type=bind,src=${output},dst=/build`, '-w', '/build'];
}

/** Additional constraints for native HEX: no bond storage, UICR or other devices. */
export function validateBluepadHex(hex: string) {
  let base = 0;
  for (const line of hex.trim().split(/\r?\n/)) {
    const b = Buffer.from(line.slice(1), 'hex');
    const kind = b[3], size = b[0];
    if (kind === 4 && size === 2) base = b.readUInt16BE(4) * 65536;
    else if (kind === 2 && size === 2) base = b.readUInt16BE(4) * 16;
    else if (kind === 0) {
      const start = base + b.readUInt16BE(1);
      if (start + size > 0x7a000) throw new Error('Bluepad HEX overlaps reserved flash or peripheral configuration');
    } else if ((kind === 3 || kind === 5) && size === 4) {
      const entry = kind === 3 ? b.readUInt16BE(4) * 16 + b.readUInt16BE(6) : b.readUInt32BE(4);
      if (entry >= 0x7a000) throw new Error('Bluepad entry point outside application flash');
    } else if (!(kind === 1 && size === 0)) {
      throw new Error(`Unsupported Bluepad HEX record ${kind}`);
    }
  }
}

export async function bluepadInputHash(root: string) {
  const hash = createHash('sha256');
  async function visit(dir: string, relative: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'built') continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(dir, entry.name), name);
      else if (entry.isFile()) hash.update(name).update('\0').update(await readFile(join(dir, entry.name)));
      else throw new Error(`Unexpected source symlink: ${name}`);
    }
  }
  await visit(join(root, 'workspace/projects/bluepad'), 'project');
  await visit(join(root, 'toolchain/bluepad'), 'toolchain');
  for (const name of ['cli/bluepad.ts', 'toolchain/versions.json', 'toolchain/system-lock.mjs']) {
    hash.update(name).update(await readFile(join(root, name)));
  }
  return hash.digest('hex');
}

export async function bluepad(root: string, args: string[], command: Command, validateHex: (hex: string) => void) {
  const [action, ...flags] = args;
  if (action === 'inspect' && flags.length >= 1 && flags.length <= 2) {
    await command(['docker', 'run', '--rm', '--network', 'none', '--read-only',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', image, 'node', '-e',
      `const fs = require('node:fs');
       const path = fs.realpathSync(process.argv[1]);
       if (!path.startsWith('/opt/bluepad/')) throw new Error('Inspect only Bluepad image sources');
       if (fs.statSync(path).isDirectory()) { console.log(fs.readdirSync(path).join('\\n')); process.exit(0); }
       const lines = fs.readFileSync(path, 'utf8').split('\\n');
       lines.forEach((line, i) => { if (!process.argv[2] || line.includes(process.argv[2])) console.log((i + 1) + ': ' + line); });`,
      ...flags]);
    return;
  }
  if (action === 'lock-sdk' && flags.length === 0) {
    const path = join(root, 'toolchain/bluepad/sdk.json');
    const { version } = JSON.parse(await readFile(path, 'utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid SDK version');
    // Only metadata is returned to the host; SDK archives are fetched by Dockerfile.
    const script = `const version = process.argv[1];
      const response = await fetch('https://api.github.com/repos/zephyrproject-rtos/sdk-ng/releases/tags/v' + version);
      if (!response.ok) throw new Error('SDK metadata: ' + response.status);
      const release = await response.json();
      const names = ['zephyr-sdk-' + version + '_linux-x86_64_minimal.tar.xz', 'toolchain_gnu_linux-x86_64_arm-zephyr-eabi.tar.xz'];
      const archives = names.map((name, index) => {
        const asset = release.assets.find(a => a.name === name);
        if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('Missing release digest for ' + name + '; available ARM archives: ' + release.assets.filter(a => /linux.*x86_64.*arm/.test(a.name)).map(a => a.name).join(', '));
        return { name, archive_url: asset.browser_download_url, archive_sha256: asset.digest.slice(7),
          archive_size_bytes: asset.size, destination: index ? '/opt/zephyr-sdk/gnu/arm-zephyr-eabi' : '/opt/zephyr-sdk' };
      });
      console.log(JSON.stringify({version, archives}, null, 2));`;
    const manifest = await command(['docker', 'run', '--rm', '--network', 'bridge', '--read-only',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', image, 'node', '--input-type=module', '-e', script, version], true);
    JSON.parse(manifest);
    await writeFile(path, manifest + '\n');
    return;
  }
  if (action === 'lock-base' && flags.length === 0) {
    const path = join(root, 'toolchain/bluepad/versions.json');
    const v = JSON.parse(await readFile(path, 'utf8'));
    await command(['docker', 'pull', '--platform', v.architecture, v.baseImage]);
    const digests = JSON.parse(await command(['docker', 'image', 'inspect', v.baseImage, '--format', '{{json .RepoDigests}}'], true));
    if (!digests[0]?.includes('@sha256:')) throw new Error('No base image digest');
    v.baseImage = digests[0];
    await writeFile(path, JSON.stringify(v, null, 2) + '\n');
    return;
  }
  if (action === 'image' && flags.length === 0) {
    const v = JSON.parse(await readFile(join(root, 'toolchain/bluepad/versions.json'), 'utf8'));
    if (!v.baseImage.includes('@sha256:')) throw new Error('Pin the base first with run bluepad lock-base');
    await command(['docker', 'build', '--platform', v.architecture, '--build-arg', `NODE_IMAGE=${v.baseImage}`,
      '--label', `org.microbit.bluepad.recipe=${await recipeHash(root)}`,
      '-f', join(root, 'toolchain/bluepad/Dockerfile'), '-t', image, join(root, 'toolchain')]);
    return;
  }
  if (action === 'lock-system' && flags.length === 0) {
    const manifest = await command(['docker', 'run', '--rm', '--network', 'none', '--read-only', image,
      'node', '/opt/pxt/system-lock.mjs', 'print'], true);
    JSON.parse(manifest);
    await writeFile(join(root, 'toolchain/bluepad/system-lock.json'), manifest + '\n');
    return;
  }
  if (action === 'versions' && flags.length === 0) {
    for (const cmd of [[armTool + 'gcc', '--version'], ['cmake', '--version'], ['python3', '--version'],
      ['node', '/opt/pxt/system-lock.mjs', 'print']]) {
      await command(['docker', 'run', '--rm', '--network', 'none', '--read-only', image, ...cmd]);
    }
    return;
  }
  const adapter = flags.length === 1 && flags[0] === '--nezha-compile-only';
  if (!['build', 'test'].includes(action) || (flags.length && !(action === 'build' && adapter))) {
    throw new Error('Use run bluepad image|build [--nezha-compile-only]|test|versions|lock-system|lock-base|lock-sdk');
  }
  const variant = action === 'test' ? 'packet-tests' : adapter ? 'nezha-compile-only' : 'report-only';
  const output = join(root, 'workspace/projects/bluepad/built', variant);
  await mkdir(output, { recursive: true });
  const metadata = JSON.parse(await command(['docker', 'image', 'inspect', image], true))[0];
  if (metadata.Config.Labels?.['org.microbit.bluepad.recipe'] !== await recipeHash(root)) {
    throw new Error('Bluepad image recipe changed; run image bluepad before building');
  }
  const imageId = metadata.Id;
  const run = (argv: string[], capture = false) => command(['docker', 'run', ...bluepadArgs(root, output), imageId, ...argv], capture);
  if (action === 'test') {
    for (const name of ['nezha_packet', 'start_gate', 'joystick_frame']) {
    await run(['gcc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined', '-g',
      '-I/app/app', `/app/tests/test_${name}.c`, '-o', `/build/test-${name}`]);
    await run([`/build/test-${name}`]);
    }
    console.log('Bluepad packet, start-button and joystick-frame tests passed inside the offline container (ASan/UBSan).');
    return;
  }
  // Never leave a prior success receipt after a failed rebuild.
  await rm(join(output, 'verified-build.json'), { force: true });
  const source = await bluepadInputHash(root);
  // A clean configure avoids stale flags and toolchain caches after image changes.
  await rm(join(output, 'cmake'), { recursive: true, force: true });
  const configure = ['cmake', '-S', '/app/app', '-B', '/build/cmake', '-GNinja',
    '-DBOARD=bbc_microbit_v2/nrf52833',
    '-DUSER_CACHE_DIR=/build/cmake/cache',
    '-DZEPHYR_MODULES=/opt/bluepad/modules/CMSIS_6;/opt/bluepad/modules/cmsis;/opt/bluepad/modules/hal_nordic',
    '-DPython3_EXECUTABLE=/usr/bin/python3', '-DBUILD_VERSION=bluepad-microbit-experiment',
    `-DENABLE_NEZHA_ADAPTER=${adapter ? 'ON' : 'OFF'}`];
  if (adapter) configure.push('-DDTC_OVERLAY_FILE=/app/app/nezha.overlay', '-DEXTRA_CONF_FILE=/app/app/nezha.conf');
  await run(configure);
  await run(['cmake', '--build', '/build/cmake', '-j4']);
  const elf = '/build/cmake/zephyr/zephyr.elf';
  const symbols = await run([armTool + 'nm', '-n', elf], true);
  const unresolved = await run([armTool + 'nm', '-u', elf], true);
  if (unresolved) throw new Error(`Unresolved native symbols: ${unresolved}`);
  if (/\bnezha_write_motor\b/.test(symbols) !== adapter) throw new Error('Unexpected motor adapter linkage');
  for (const required of ['uni_hid_parser_xboxone_setup', 'bt_enable_raw', 'hids_host_connect', 'btstack_main']) {
    if (!symbols.includes(` ${required}\n`)) throw new Error(`Missing Bluetooth implementation: ${required}`);
  }
  const disassembly = await run([armTool + 'objdump', '-d', elf], true);
  if (/\b(?:bl|blx|b\.w)\s+[^\n]*<nezha_write_motor>/.test(disassembly)) throw new Error('Unexpected motor adapter call');
  const hex = await readFile(join(output, 'cmake/zephyr/zephyr.hex'), 'utf8');
  validateHex(hex);
  validateBluepadHex(hex);
  if (source !== await bluepadInputHash(root)) throw new Error('Build inputs changed during compilation; rebuild');
  const sizes = await run([armTool + 'size', elf], true);
  await writeFile(join(output, 'linked-symbols.txt'), symbols + '\n');
  await writeFile(join(output, 'arm-size.txt'), sizes + '\n');
  await writeFile(join(output, 'binary.hex'), hex);
  await writeFile(join(output, 'verified-build.json'), JSON.stringify({
    source, image: imageId, variant, hex: createHash('sha256').update(hex).digest('hex'),
    unresolvedSymbols: false, motorAdapterPresent: adapter, motorAdapterDirectCalls: 0,
    hardwareTested: false, flashed: false,
  }, null, 2) + '\n');
  console.log(`${sizes}\nVerified ${variant} build: ${output}/binary.hex\nNo hardware was accessed or flashed.`);
}
