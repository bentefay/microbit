"""Offline Kokoro synthesis: prompts.json -> 24 kHz 16-bit WAV candidates + manifest."""
import hashlib
import json
from pathlib import Path
import sys

import soundfile
import torch
from kokoro import KModel, KPipeline

assets = Path('/opt/tts/assets')
prompts = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
torch.set_num_threads(1)
torch.use_deterministic_algorithms(True)
model = KModel(config=str(assets / 'config.json'), model=str(assets / 'kokoro-v1_0.pth')).eval()
pipeline = KPipeline(lang_code=prompts['lang_code'], repo_id='hexgrad/Kokoro-82M', model=model)
manifest = {'engine': 'kokoro-82m', 'sample_rate': 24000, 'clips': []}
for voice in prompts['voices']:
    (out / voice).mkdir(parents=True, exist_ok=True)
    for clip in prompts['clips']:
        torch.manual_seed(prompts['seed'])  # The vocoder draws noise; reseed per clip.
        results = list(pipeline(clip['text'], voice=str(assets / 'voices' / f'{voice}.pt'), speed=prompts['speed']))
        if len(results) != 1:
            raise RuntimeError(f'{clip["id"]}: expected one segment, got {len(results)}')
        phonemes, audio = results[0].phonemes, results[0].audio.numpy()
        path = out / voice / f'{clip["id"]}.wav'
        soundfile.write(path, audio, 24000, subtype='PCM_16')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest['clips'].append({'voice': voice, 'id': clip['id'], 'text': clip['text'], 'phonemes': phonemes,
                                  'samples': len(audio), 'file': f'{voice}/{clip["id"]}.wav', 'sha256': digest})
        print(f'{voice} {clip["id"]}: /{phonemes}/ {len(audio) / 24000:.2f}s', flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
