#!/usr/bin/env python3
"""Check the vendored libsm64 subset against its pinned upstream revision.

Every file must match upstream byte for byte, unless vendor/manifest.json lists
it under "patches": a deliberate local change (a bug fix or a lifted limit),
recorded with its reason and the hash it must now have. Anything else is an
accidental or undocumented change. After changing a vendored file on purpose,
add or update its entry: tools/check_vendor.py --record PATH "why"."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'vendor/manifest.json'
manifest = json.loads(MANIFEST.read_text())
sha = lambda path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

if sys.argv[1:2] == ['--record']:
    path, why = sys.argv[2], sys.argv[3]
    assert path in manifest['files'], f'{path} is not a vendored file'
    manifest.setdefault('patches', {})[path] = {'sha256': sha(path), 'why': why}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Recorded the patch to {path}')
    sys.exit()

patches = manifest.get('patches', {})
for path, expected in manifest['files'].items():
    actual = sha(path)
    if path in patches:
        if actual == expected: raise SystemExit(f'Patch recorded but not applied: {path}')
        if actual != patches[path]['sha256']: raise SystemExit(f'Undocumented change to a patched file: {path}')
    elif actual != expected: raise SystemExit(f'Vendor mismatch: {path} (record deliberate patches in vendor/manifest.json)')
print(f"Verified {len(manifest['files']) - len(patches)} unchanged upstream files and {len(patches)} recorded patches")
