#!/usr/bin/env python3
"""Detect local changes in the byte-for-byte vendored upstream subset."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'vendor/manifest.json').read_text())
for path, expected in manifest['files'].items():
    actual=hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    if actual!=expected: raise SystemExit(f'Vendor mismatch: {path}')
print(f"Verified {len(manifest['files'])} unchanged upstream files")
