import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { convertPcm, readPcmWav } from './audio';

test('checked-in voice clips decode and reproduce checked-in firmware metadata', async () => {
  const base = 'workspace/projects/bluepad/audio';
  const metadata = JSON.parse(await readFile(base + '/firmware.json', 'utf8'));
  const header = await readFile('workspace/projects/bluepad/app/speech_data.h', 'utf8');
  for (const [index, clip] of metadata.clips.entries()) {
    const wav = await readFile(`${base}/candidates/${metadata.voice}/${clip.id}.wav`);
    const { pcm, first, last } = convertPcm(readPcmWav(wav).samples);
    expect(pcm.length).toBe(clip.samples);
    expect(first).toBe(clip.first); expect(last).toBe(clip.last);
    expect(new Bun.CryptoHasher('sha256').update(pcm).digest('hex')).toBe(clip.pcmSha256);
    const array = header.match(new RegExp(`speech_${index}\\[\\] = \\{([^}]+)\\}`))?.[1];
    expect(array).toBeDefined();
    const checkedIn = Uint8Array.from(array!.split(',').map(v => v.trim()).filter(Boolean).map(Number));
    expect(new Bun.CryptoHasher('sha256').update(checkedIn).digest('hex')).toBe(clip.pcmSha256);
  }
});
test('trim retains low-level initial sibilants and normalises without clipping', () => {
  const pcm = new Float64Array(24000);
  for (let i = 6000; i < 7200; i++) pcm[i] = (i % 2 ? 1 : -1) * .002;
  for (let i = 7200; i < 12000; i++) pcm[i] = .1 * Math.sin(i * Math.PI / 12);
  const result = convertPcm(pcm);
  expect(result.first).toBe(3600);
  expect(result.last).toBe(14880);
  expect(Math.min(...result.pcm)).toBeGreaterThanOrEqual(26);
  expect(Math.max(...result.pcm)).toBeLessThanOrEqual(230);
  expect(() => convertPcm(new Float64Array(24000))).toThrow('Silent');
  expect(() => convertPcm(new Float64Array([NaN]))).toThrow('Invalid');
});
test('resampler rejects aliases above its passband', () => {
  // Normalisation masks absolute attenuation; compare a 10 kHz interferer
  // against an equal-amplitude 1 kHz wanted tone in the same input.
  const source = Float64Array.from({ length: 24000 }, (_, i) => .2 * (Math.sin(2 * Math.PI * 1000 * i / 24000) + Math.sin(2 * Math.PI * 10000 * i / 24000)));
  const { pcm } = convertPcm(source);
  const energy = (hz: number) => {
    let sin = 0, cos = 0;
    for (let i = 100; i < pcm.length - 100; i++) { sin += (pcm[i] - 128) * Math.sin(2 * Math.PI * hz * i / 16000); cos += (pcm[i] - 128) * Math.cos(2 * Math.PI * hz * i / 16000); }
    return Math.hypot(sin, cos);
  };
  expect(energy(6000) / energy(1000)).toBeLessThan(.01);
});
test('WAV reader rejects invalid files and unsupported formats', async () => {
  const wav = await readFile('workspace/projects/bluepad/audio/candidates/af_heart/speed.wav');
  expect(() => readPcmWav(wav.subarray(0, wav.length - 2))).toThrow();
  const bad = Buffer.from(wav); bad.writeUInt16LE(2, 22);
  expect(() => readPcmWav(bad)).toThrow('mono');
  expect(() => readPcmWav(Buffer.alloc(44))).toThrow();
});
