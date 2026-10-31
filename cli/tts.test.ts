import { test, expect } from 'bun:test';
import { lockFromReport, ttsArgs, tts } from './tts';

const sha = 'a'.repeat(64);
const entry = (name: string, version: string, url: string, info: object = { hashes: { sha256: sha } }) =>
  ({ metadata: { name, version }, download_info: { url, archive_info: info } });
const torch = entry('torch', '2.9.0+cpu', 'https://download.pytorch.org/whl/cpu/torch-2.9.0%2Bcpu-cp312-cp312-manylinux_2_28_x86_64.whl');

test('pip report becomes a sorted, hash-locked direct-URL CPU lock', () => {
  const lock = lockFromReport({ install: [torch, entry('Kokoro', '0.9.4', 'https://files.pythonhosted.org/k.whl', { hash: `sha256=${sha}` })] });
  expect(lock.split('\n').slice(1, 3)).toEqual([
    `kokoro @ https://files.pythonhosted.org/k.whl --hash=sha256:${sha}`,
    `torch @ ${torch.download_info.url} --hash=sha256:${sha}`]);
});

test('lock rejects unhashed, insecure and CUDA artifacts', () => {
  expect(() => lockFromReport({ install: [torch, entry('numpy', '2.0', 'https://x/n.whl', {})] })).toThrow('No SHA-256');
  expect(() => lockFromReport({ install: [torch, entry('numpy', '2.0', 'http://x/n.whl')] })).toThrow('Non-HTTPS');
  expect(() => lockFromReport({ install: [torch, entry('nvidia-cublas-cu12', '12', 'https://x/c.whl')] })).toThrow('CUDA');
  expect(() => lockFromReport({ install: [entry('torch', '2.9.0', 'https://x/torch-2.9.0-cp312.whl')] })).toThrow('CPU-only');
});

test('synthesis runs without network; only locking reaches the internet', () => {
  const offline = ttsArgs('/repo', 'none');
  expect(offline[offline.indexOf('--network') + 1]).toBe('none');
  expect(offline).toContain('--read-only');
  expect(offline).toContain('--cap-drop=ALL');
  expect(offline.join(' ')).not.toContain('docker.sock');
});

test('unknown tts actions are rejected before running Docker', async () => {
  const command = async () => { throw new Error('Docker must not run'); };
  for (const args of [['speak'], ['generate', '--force'], []]) {
    await expect(tts('/repo', args as string[], command)).rejects.toThrow('Use run tts');
  }
});
