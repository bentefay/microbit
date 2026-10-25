// Executed only inside Docker, with the selected micro:bit CDC device mapped in.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const setup = spawnSync('stty', ['-F', '/dev/microbit', '115200', 'raw', '-echo'], { stdio: 'inherit' });
if (setup.error || setup.status !== 0) process.exit(1);
const fd = fs.openSync('/dev/microbit', fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
const buffer = Buffer.alloc(4096);
console.log(JSON.stringify('BP_MONITOR_OPEN\n'));
setInterval(() => {
  try {
    const size = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (size) console.log(JSON.stringify(buffer.subarray(0, size).toString('utf8')));
  } catch (error) {
    if (error.code !== 'EAGAIN') { console.error(error.message); process.exit(1); }
  }
}, 20);
