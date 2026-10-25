import { mkdir, readFile, writeFile, readdir, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectSource, lockNativeSources, resolveCommit } from './sources';
import { captureSerial } from './serial';
import { latencyReport } from './latency';
import { displayPreview } from './display-preview';
import { joystickReport } from './joystick-report';
import { research } from './research';
import { receiverReport } from './receiver-report';
import { bluepad, bluepadInputHash, validateBluepadHex } from './bluepad';
import { monitorBluepad } from './bluepad-monitor';
import { bluepadReport } from './bluepad-report';
import { bluepadTiming } from './bluepad-timing';
import { bluepadDualReport } from './bluepad-dual';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const image = 'microbit-toolchain:local';
const bootstrap = 'microbit-bootstrap:local';
const editor = 'microbit-editor';
const editorNetwork = 'microbit-local';
const workspace = join(root, 'workspace');
const versionsPath = join(root, 'toolchain/versions.json');
export function editorUrl(logs: string) {
  const url = logs.match(/http:\/\/[^\s]+:3232\/[^\s]*local_token[^\s]*/)?.[0]?.replace('0.0.0.0', 'localhost').replace('/#', '/index.html?ws=fs#');
  if (!url) throw new Error('No editor token URL in logs; wait for server startup');
  return url;
}
export function projectName(name = 'car') {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Project names must match [a-z][a-z0-9-]*');
  return name;
}
export async function command(argv: string[], capture = false, cwd = root) {
  console.error('$', argv.map(a => JSON.stringify(a)).join(' '));
  const child = Bun.spawn(argv, { cwd, stdin: 'inherit', stdout: capture ? 'pipe' : 'inherit', stderr: 'inherit' });
  const output = capture ? await new Response(child.stdout).text() : '';
  const code = await child.exited;
  if (code) throw new Error(`${argv[0]} exited ${code}`);
  return output.trim();
}
function identity() {
  if (!process.getuid || !process.getgid) throw new Error('Linux host required');
  return `${process.getuid()}:${process.getgid()}`;
}
export function runtimeArgs(network = 'none') {
  return ['--rm', '--init', '--user', identity(), '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--network', network,
    '--pids-limit', '256', '--memory', '4g', '--cpus', '4',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m',
    '--mount', `type=bind,src=${workspace},dst=/workspace`,
    '--workdir', '/workspace'];
}
async function container(mode: string, project = 'car', rest: string[] = [], online = false) {
  await command(['docker', 'run', ...runtimeArgs(online ? 'bridge' : 'none'), image, mode, projectName(project), ...rest]);
  if (mode === 'build' || mode === 'provision') {
    const dir = join(workspace, 'projects', projectName(project));
    const hex = await readFile(join(dir, 'built/binary.hex'), 'utf8');
    validateHex(hex);
    const stamp = { source: await sourceHash(dir), hex: digest(hex), image: await command(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], true) };
    await writeFile(join(dir, 'built/verified-build.json'), JSON.stringify(stamp, null, 2) + '\n');
  }
}
function digest(text: string) { return createHash('sha256').update(text).digest('hex'); }
async function sourceHash(dir: string) {
  const config = await readFile(join(dir, 'pxt.json'), 'utf8');
  const files = JSON.parse(config).files as string[];
  let contents = config;
  for (const file of [...files].sort()) contents += '\n' + file + '\n' + await readFile(join(dir, file), 'utf8');
  return digest(contents);
}
async function buildImage(target: string) {
  const v = JSON.parse(await readFile(versionsPath, 'utf8'));
  await command(['docker', 'build', '--platform', v.architecture, '--target', target,
    '--build-arg', `NODE_IMAGE=${v.nodeImage}`, '--build-arg', `SAFE_CHAIN_VERSION=${v.safeChain}`,
    '--build-arg', `SAFE_CHAIN_SHA256=${v.safeChainSha256}`, '-t', target === 'bootstrap' ? bootstrap : target === 'browser' ? 'microbit-browser:local' : image,
    join(root, 'toolchain')]);
}
async function lockDependencies() {
  const v = JSON.parse(await readFile(versionsPath, 'utf8'));
  if (!v.nodeImage.includes('@sha256:')) {
    await command(['docker', 'pull', '--platform', v.architecture, v.nodeImage]);
    const digests = JSON.parse(await command(['docker', 'image', 'inspect', v.nodeImage, '--format', '{{json .RepoDigests}}'], true));
    if (!digests[0]?.includes('@sha256:')) throw new Error('No base image digest resolved');
    v.nodeImage = digests[0];
    await writeFile(versionsPath, JSON.stringify(v, null, 2) + '\n');
  }
  await buildImage('bootstrap');
  await command(['docker', 'run', '--rm', '--user', identity(), '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '-e', 'HOME=/tmp/home', '--mount', `type=bind,src=${join(root, 'toolchain')},dst=/work`, '-w', '/work', bootstrap,
    'npm', 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
}
export function parseFindmnt(text: string): { source: string; target: string; fstype: string }[] {
  const data = JSON.parse(text);
  return (data.filesystems || []).flatMap((f: any) => [f, ...(f.children || [])]);
}
async function devices() {
  const result: any[] = [];
  for (const name of await readdir('/sys/bus/usb/devices')) {
    const path = `/sys/bus/usb/devices/${name}`;
    try {
      const vid = (await readFile(`${path}/idVendor`, 'utf8')).trim();
      const pid = (await readFile(`${path}/idProduct`, 'utf8')).trim();
      if (vid !== '0d28' || pid !== '0204') continue;
      const serial = (await readFile(`${path}/serial`, 'utf8')).trim();
      result.push({ name, sysfs: await realpath(path), serial });
    } catch {}
  }
  return result;
}
async function mount() {
  const usb = await devices();
  if (usb.length !== 1) throw new Error(`Expected one micro:bit, found ${usb.length}`);
  const mounts = parseFindmnt(await command(['findmnt', '--json', '--list', '-o', 'SOURCE,TARGET,FSTYPE'], true));
  for (const m of mounts) {
    if (m.fstype !== 'vfat' || !m.source.startsWith('/dev/')) continue;
    const block = m.source.slice(5);
    const sys = await realpath(`/sys/class/block/${block}`).catch(() => '');
    if (!sys.startsWith(usb[0].sysfs + '/')) continue;
    const details = await readFile(join(m.target, 'DETAILS.TXT'), 'utf8');
    if (!details.includes('DAPLink') || !details.includes('Daplink Mode: Interface')) throw new Error('Unexpected interface mode');
    return { ...m, ...usb[0], details };
  }
  throw new Error('No mounted MICROBIT filesystem belongs to the detected USB device. Mount it in your desktop first.');
}
async function serial(seconds = '10', label = 'capture', continuous = false) {
  projectName(label);
  const duration = Number(seconds);
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) throw new Error('Serial duration must be 1–600 seconds');
  const usb = await devices();
  if (usb.length !== 1) throw new Error('Expected one micro:bit');
  const matches: string[] = [];
  for (const tty of await readdir('/sys/class/tty')) {
    if (!tty.startsWith('ttyACM')) continue;
    const sysfs = await realpath(`/sys/class/tty/${tty}/device`).catch(() => '');
    if (sysfs.startsWith(usb[0].sysfs + '/')) matches.push(`/dev/${tty}`);
  }
  if (matches.length !== 1) throw new Error('Expected one CDC serial interface for this micro:bit');
  const device = matches[0];
  if (continuous) {
    await monitorBluepad(['docker', 'run', '--rm', '--init', '--user', identity(),
      '--group-add', String((await stat(device)).gid), '--network', 'none',
      '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only',
      '--device', `${device}:/dev/microbit:rw`,
      '--mount', `type=bind,src=${join(root, 'cli/serial-transport.mjs')},dst=/serial-transport.mjs,readonly`,
      '--entrypoint', 'node', image, '/serial-transport.mjs'], root);
    return;
  }
  await captureSerial(['docker', 'run', '--rm', '--init', '--user', identity(), '--group-add', String((await stat(device)).gid),
    '--network', 'none', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only',
    '--device', `${device}:/dev/microbit:rw`, image, 'serial', String(duration)], join(root, '.cache/observations'), label);
}
async function stopBluepadMonitor() {
  const ids = (await command(['docker', 'ps', '-q'], true)).split(/\s+/).filter(Boolean);
  if (!ids.length) return;
  const containers = JSON.parse(await command(['docker', 'inspect', ...ids], true));
  for (const c of containers) {
    if (c.Path === 'node' && JSON.stringify(c.Args) === JSON.stringify(['/serial-transport.mjs']) &&
      c.Mounts?.some((m: any) => m.Source === join(root, 'cli/serial-transport.mjs') && m.Destination === '/serial-transport.mjs'))
      await command(['docker', 'stop', '--time', '2', c.Id]);
  }
}
export function validateBluepadFlashVariant(stamp: any, bench: boolean) {
  if (stamp.variant !== (bench ? 'motor-bench' : 'report-only') || stamp.motorAdapterPresent !== false ||
      (bench ? stamp.motorBench !== true : stamp.motorBench === true))
    throw new Error('Bluepad artifact does not match the explicitly selected flash variant');
}
async function flash(project: string, confirmed: boolean, bench = false) {
  if (!confirmed) throw new Error('Flashing starts the program. Use run flash PROJECT --confirm after arranging a controlled bench test.');
  if (bench && project !== 'bluepad') throw new Error('--motor-bench is only for bluepad');
  const path = join(workspace, 'projects', projectName(project), 'built', ...(project === 'bluepad' ? [bench ? 'motor-bench' : 'report-only'] : []));
  const hex = await readFile(join(path, 'binary.hex'), 'utf8');
  validateHex(hex);
  const stamp = JSON.parse(await readFile(join(path, 'verified-build.json'), 'utf8'));
  if (project === 'bluepad') {
    validateBluepadHex(hex);
    validateBluepadFlashVariant(stamp, bench);
  }
  const currentSource = project === 'bluepad' ? await bluepadInputHash(root) : await sourceHash(resolve(path, '..'));
  if (stamp.hex !== digest(hex) || stamp.source !== currentSource) throw new Error('Source or artifact changed since the verified build. Run build again.');
  const device = await mount();
  console.log(`Flashing ${project} to ${device.serial} at ${device.target}`);
  await command(['docker', 'run', '--rm', '--user', identity(), '--network', 'none', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--read-only',
    '--mount', `type=bind,src=${path},dst=/artifact,readonly`,
    '--mount', `type=bind,src=${device.target},dst=/device`, image, 'flash']);
  // DAPLink can remove/re-enumerate the drive while programming. Wait for desktop remount.
  let after: Awaited<ReturnType<typeof mount>> | undefined;
  for (let attempt = 0; attempt < 30; attempt++) {
    await Bun.sleep(1000);
    try { after = await mount(); } catch { continue; }
    if (after.serial !== device.serial) throw new Error('Device changed during flashing');
    const beforeCount = device.details.match(/Remount count: (\d+)/)?.[1];
    const afterCount = after.details.match(/Remount count: (\d+)/)?.[1];
    if (beforeCount !== afterCount) break;
    after = undefined;
  }
  if (!after) throw new Error('HEX transferred, but device remount was not verified within 30 seconds. Inspect the device before retrying.');
  if (after.serial !== device.serial) throw new Error('Device changed during flashing');
  const failure = join(after.target, 'FAIL.TXT');
  if (existsSync(failure)) throw new Error(`DAPLink rejected flashing: ${await readFile(failure, 'utf8')}`);
  await writeFile(join(path, 'flash-result.json'), JSON.stringify({ serial: after.serial, hex: digest(hex), time: new Date().toISOString(), daplink: 'remounted; no FAIL.TXT', hardwareResponse: 'requires observation' }, null, 2) + '\n');
  console.log('Transfer finished; same device present and no FAIL.TXT. Confirm the display on hardware.');
}
export function validateHex(hex: string) {
  let eof = false;
  let data = false;
  for (const line of hex.trim().split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^:[0-9a-f]+$/i.test(line) || line.length % 2 !== 1) throw new Error('Malformed Intel HEX');
    const bytes = Buffer.from(line.slice(1), 'hex');
    if (bytes.length !== bytes[0] + 5 || [...bytes].reduce((a, b) => a + b, 0) % 256) throw new Error('Invalid HEX checksum/length');
    // MakeCode appends checksum-protected source metadata (type 0x0e) after EOF.
    if (eof && bytes[3] !== 14) throw new Error('Program data after HEX end record');
    if (bytes[3] === 1) eof = true;
    if ((bytes[3] === 0 || bytes[3] === 13) && bytes[0] > 0) data = true;
  }
  if (!eof) throw new Error('Missing HEX end record');
  if (!data) throw new Error('HEX has no program data');
}
async function doctor() {
  console.log(`Workspace: ${root}\nBun: ${Bun.version}`);
  await command(['docker', 'version', '--format', '{{.Server.Version}}']);
  console.log('micro:bit USB:', JSON.stringify(await devices()));
  console.log('Dependency lock:', existsSync(join(root, 'toolchain/package-lock.json')));
  console.log('No hardware was written.');
}
const help = `micro:bit workspace — run COMMAND
  doctor                       Read-only host and device diagnostics
  deps lock                    Resolve base image digest and safe-chain npm lock
  deps lock-vendors            Resolve configured vendor tags to source commits
  image build                  Build pinned toolchain container
  image versions               Report installed container packages
  image lock-system            Record installed Debian versions for drift checking
  image browser                Build the optional browser-test image
  image bluepad                Download pinned Zephyr/Bluepad sources and tools into Docker
  build bluepad [--nezha-compile-only|--motor-bench]  Offline native build; never flashes
  bluepad test|versions|lock-system    Container packet tests / tool versions / Debian lock
  bluepad monitor              Continuous capture; wait for micro:bit A/B start signal
  bluepad monitor-stop         Stop only this repository's serial monitor container
  bluepad dual-report FILE     Verify two concurrent controllers and LED ownership
  bluepad report FILE          Summarize captured input coverage and neutral return
  bluepad timing FILE          Compare report cadence during sampled stick movement
  bluepad inspect PATH [TEXT]   Read pinned native source inside Docker
  native lock                  Resolve native release tags and transitive source pins
  provision [PROJECT]          Alias for an offline first build; sources are in the image
  build [PROJECT] [--force]    Offline local PXT/native build (default car)
  serve                        Local blocks editor on localhost:3232
  stop                         Stop local editor
  logs                         Show editor logs
  editor-test                  Exercise editor in an isolated Chromium container
  new NAME                     Create a motionless project
  pxt PROJECT ARGS...           Run a PXT diagnostic in the offline container
  device                       Inspect USB and verified MICROBIT mount
  serial [SECONDS] [LABEL]     Capture serial in Docker; save timestamped local logs
  latency-report FILE          Analyze guided cue/input/command/encoder timestamps
  display-preview              Generate an offline interactive joystick LED preview
  joystick-report FILE         Summarize normal-mode stick ranges and center samples
  flash PROJECT --confirm      Explicitly transfer existing HEX; never builds
  flash bluepad --motor-bench --confirm  Select finite loose-motor sequence explicitly
  test                         Run TypeScript CLI tests
  env lock                     Resolve devenv lock through the normal devenv flow
  inspect PATH [TEXT]           Inspect a toolchain/workspace file inside Docker
  source samples|target|core [PATH]  Read-only upstream source inspection
  research URL [TEXT]           Read/cache public vendor/GitHub evidence, never execute it
  car-mode drive|receiver-lab   Select checked-in car entry point; never builds or flashes
  receiver-report FILE         Analyze full-rate receiver timing and repeated values
`;
export async function main(args: string[]) {
  try {
    const [cmd, arg, ...rest] = args;
    switch (cmd) {
      case undefined: case 'help': case '--help': console.log(help); break;
      case 'doctor': await doctor(); break;
      case 'deps':
        if (arg === 'lock') await lockDependencies();
        else if (arg === 'lock-vendors') {
          const versions = JSON.parse(await readFile(versionsPath, 'utf8'));
          for (const source of Object.values(versions.sources) as any[]) source.rev = await resolveCommit(source.repo, source.tag);
          await writeFile(versionsPath, JSON.stringify(versions, null, 2) + '\n');
        } else throw new Error(help);
        break;
      case 'image':
        if (arg === 'build') await buildImage('toolchain');
        else if (arg === 'browser') await buildImage('browser');
        else if (arg === 'bluepad') await bluepad(root, ['image', ...rest], command, validateHex);
        else if (arg === 'lock-system') {
          const manifest = await command(['docker', 'run', '--rm', '--network', 'none', image, 'system-manifest'], true);
          JSON.parse(manifest);
          await writeFile(join(root, 'toolchain/system-lock.json'), manifest + '\n');
        }
        else if (arg === 'versions') await command(['docker','run','--rm','--network','none',image,'versions']);
        else throw new Error(help); break;
      case 'build': case 'provision':
        if (arg === 'bluepad') await bluepad(root, ['build', ...rest], command, validateHex);
        else await container(cmd, arg, rest);
        break;
      case 'bluepad':
        if (arg === 'monitor' && rest.length === 0) await serial('10', 'bluepad-session', true);
        else if (arg === 'monitor-stop' && rest.length === 0) await stopBluepadMonitor();
        else if (arg === 'dual-report' && rest.length === 1) console.log(JSON.stringify(bluepadDualReport(await readFile(resolve(rest[0]), 'utf8')), null, 2));
        else if (arg === 'report' && rest.length === 1) console.log(JSON.stringify(bluepadReport(await readFile(resolve(rest[0]), 'utf8')), null, 2));
        else if (arg === 'timing' && rest.length === 1) console.log(JSON.stringify(bluepadTiming(await readFile(resolve(rest[0]), 'utf8')), null, 2));
        else await bluepad(root, [arg, ...rest], command, validateHex);
        break;
      case 'pxt': await container('pxt', arg, rest); break;
      case 'inspect': await container('inspect', 'car', [arg || '', ...rest]); break;
      case 'source': await inspectSource(arg, rest[0]); break;
      case 'research':
        if (!arg) throw new Error('Use run research HTTPS-URL [TEXT]');
        await research(root, arg, rest[0]); break;
      case 'car-mode': {
        if (arg !== 'drive' && arg !== 'receiver-lab') throw new Error('Use car-mode drive|receiver-lab');
        const call = arg === 'drive' ? 'startDriving' : 'startReceiverLab';
        const block = arg === 'drive' ? 'car_start_driving' : 'car_start_receiver_lab';
        const dir = join(workspace, 'projects/car');
        await writeFile(join(dir, 'main.ts'), `car.${call}()\n`);
        await writeFile(join(dir, 'main.blocks'), `<xml xmlns="https://developers.google.com/blockly/xml"><block type="pxt-on-start" x="0" y="0"><statement name="HANDLER"><block type="${block}"></block></statement></block></xml>\n`);
        console.log(`Selected ${arg}; run build car, then explicitly flash when ready.`);
        break;
      }
      case 'native':
        if (arg !== 'lock') throw new Error('Use run native lock');
        await writeFile(join(root, 'toolchain/native-lock.json'), JSON.stringify(await lockNativeSources(), null, 2) + '\n');
        break;
      case 'serve':
        // Idempotently ensure an internal network, and reject an existing external one.
        if (!(await command(['docker', 'network', 'ls', '--filter', `name=^${editorNetwork}$`, '--format', '{{.Name}}'], true))) {
          await command(['docker', 'network', 'create', '--internal', editorNetwork]);
        }
        if (await command(['docker', 'network', 'inspect', editorNetwork, '--format', '{{.Internal}}'], true) !== 'true') throw new Error('Editor network must be internal');
        await command(['docker', 'run', '-d', '--name', editor, ...runtimeArgs(editorNetwork),
          '-p', '127.0.0.1:3232:3232', '-p', '127.0.0.1:3233:3233', image, 'serve']);
        console.log('Editor starting. run logs shows the localhost URL/token.'); break;
      case 'stop': await command(['docker','stop',editor]); break;
      case 'logs': {
        const logs = await command(['docker','logs',editor], true);
        console.log(logs);
        console.log('Shared-files editor:', editorUrl(logs));
        break;
      }
      case 'editor-test': {
        const logs = await command(['docker', 'logs', editor], true);
        const url = editorUrl(logs);
        await command(['docker', 'run', ...runtimeArgs(`container:${editor}`), 'microbit-browser:local', 'editor-test', 'car', url]);
        break;
      }
      case 'device': console.log(JSON.stringify(await mount(), null, 2)); break;
      case 'serial': await serial(arg, rest[0]); break;
      case 'latency-report': {
        if (!arg) throw new Error('Use run latency-report PATH-TO-CAPTURE.jsonl');
        console.table(latencyReport(await readFile(resolve(arg), 'utf8')));
        console.log('Cue-to-input includes human reaction and radio/receiver delay. Encoder ranges describe reported position samples, not exact physical onset.');
        break;
      }
      case 'display-preview': await displayPreview(root); break;
      case 'joystick-report': {
        if (!arg) throw new Error('Use run joystick-report PATH-TO-CAPTURE.jsonl');
        console.log(JSON.stringify(joystickReport(await readFile(resolve(arg), 'utf8')), null, 2));
        console.log('Sparse snapshots (~1 Hz); radius assumes independently normalized axes. Cannot establish dropout duration, radio freshness, or physical input latency.');
        break;
      }
      case 'receiver-report': {
        if (!arg) throw new Error('Use receiver-report PATH-TO-CAPTURE.jsonl');
        console.log(JSON.stringify(receiverReport(await readFile(resolve(arg), 'utf8')), null, 2));
        console.log('Identical samples do not prove stale radio data. Center spans and change intervals are sampled observations, not physical latency. Compare profiles using the same continuous stick movement.');
        break;
      }
      case 'flash':
        if (rest.some(x => !['--confirm', '--motor-bench'].includes(x))) throw new Error('Unknown flash option');
        await flash(projectName(arg), rest.includes('--confirm'), rest.includes('--motor-bench')); break;
      case 'new': {
        const name = projectName(arg);
        const dir = join(workspace, 'projects', name);
        await mkdir(dir); // fail rather than overwrite
        await writeFile(join(dir, 'pxt.json'), JSON.stringify({name, disableHistory:true, dependencies:{core:'*'},files:['main.ts'],preferredEditor:'tsprj'},null,2)+'\n');
        await writeFile(join(dir, 'main.ts'), 'basic.showIcon(IconNames.Heart)\n');
        break;
      }
      case 'test': await command([process.execPath, 'test', 'cli']); break;
      case 'env': if (arg !== 'lock') throw new Error(help); await command(['devenv', 'update']); break;
      default: throw new Error(help);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
