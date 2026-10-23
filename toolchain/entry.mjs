import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [command, project = 'car', ...args] = process.argv.slice(2);
function exec(cmd, argv, cwd = '/workspace') {
  const result = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
function prepare() {
  fs.mkdirSync('/tmp/home', { recursive: true });
  fs.mkdirSync('/workspace/built', { recursive: true });
  fs.mkdirSync('/workspace/built/hexcache', { recursive: true });
  if (!fs.existsSync('/workspace/node_modules')) fs.symlinkSync('/opt/pxt/node_modules', '/workspace/node_modules');
  fs.writeFileSync('/workspace/pxtcli.json', JSON.stringify({ targetdir: '/opt/pxt/node_modules/pxt-microbit' }));
  if (!fs.existsSync('/workspace/vendor')) fs.cpSync('/opt/vendor', '/workspace/vendor', { recursive: true });
}
if (command === 'serial') {
  exec('stty', ['-F', '/dev/microbit', '115200', 'raw', '-echo'], '/');
  // A blocking TTY read can keep Node's threadpool alive even during process.exit.
  const fd = fs.openSync('/dev/microbit', fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const buffer = Buffer.alloc(4096);
  const poll = setInterval(() => {
    try {
      const size = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (size) console.log(JSON.stringify(buffer.subarray(0, size).toString('utf8')));
    } catch (error) { if (error.code !== 'EAGAIN') { console.error(error.message); process.exit(1); } }
  }, 20);
  setTimeout(() => { clearInterval(poll); fs.closeSync(fd); }, Number(project) * 1000);
} else if (command === 'system-manifest') {
  exec('node', ['/opt/pxt/system-lock.mjs', 'print'], '/opt/pxt');
} else if (command === 'editor-test') {
  exec('node', ['/opt/pxt/editor-test.mjs', ...args]);
} else if (command === 'inspect') {
  const file = path.resolve(args[0] || '/opt/pxt/package.json');
  if (!['/opt/pxt/', '/opt/vendor/', '/opt/native/', '/workspace/'].some(prefix => file.startsWith(prefix))) throw new Error('Inspect only toolchain/workspace files');
  if (fs.statSync(file).isDirectory()) console.log(fs.readdirSync(file).join('\n'));
  else {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const pattern = args[1];
    for (let i = 0; i < lines.length; i++) if (!pattern || lines[i].includes(pattern)) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
} else if (command === 'versions') {
  exec('node', ['--version'], '/opt/pxt');
  exec('arm-none-eabi-gcc', ['--version'], '/opt/pxt');
  exec('dpkg-query', ['-W'], '/opt/pxt');
} else if (command === 'flash') {
  const source = '/artifact/binary.hex';
  const text = fs.readFileSync(source, 'utf8');
  if (!text.startsWith(':') || !text.includes(':00000001FF')) throw new Error('Not an Intel HEX artifact');
  const fd = fs.openSync('/device/MICROBIT.hex', 'w');
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  console.log('HEX copied and synced. Check device status before treating flashing as verified.');
} else {
  prepare();
  const cli = '/opt/pxt/node_modules/pxt/cli.js';
  const cwd = path.join('/workspace/projects', project);
  if (command === 'build' || command === 'provision') {
    const native = path.join(cwd, 'built/codal');
    if (!fs.existsSync(native)) fs.cpSync('/opt/native', native, { recursive: true });
    exec('node', [cli, 'install'], cwd);
    exec('node', [cli, 'build', '--localbuild', ...args], cwd);
    const cacheFile = path.join(native, 'buildcache.json');
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile));
      if (cache.sha) fs.copyFileSync(path.join(native, 'build/MICROBIT.hex'), `/workspace/built/hexcache/${cache.sha}.hex`);
    }
  } else if (command === 'serve') {
    exec('node', ['--require', '/opt/pxt/local-only.cjs', cli, 'serve', '--noBrowser', '--noSerial', '--localbuild', '--just', '--hostname', '0.0.0.0'], '/workspace');
  } else if (command === 'pxt') exec('node', [cli, ...args], cwd);
  else throw new Error(`Unknown container command: ${command}`);
}
