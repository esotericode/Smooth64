#!/usr/bin/env python3
"""JSON in, exact state bytes per tick out. Used for cross-compiler parity.

With "sounds": true, each tick is {"state": hex, "sounds": [sound IDs]}."""
import json
import sys
from native import Native

data=json.load(sys.stdin)
core=Native()
core.world(data['triangles'])
core.reset(data['position'],data['yaw'])
result=[]
for frame in data['inputs']:
    if frame.get('heal'): core.heal(frame['heal'])
    core.tick(frame['x'],frame['y'],frame['buttons'],frame['yaw'])
    result.append({'state':core.raw().hex(),'sounds':core.sounds()} if data.get('sounds') else core.raw().hex())
json.dump(result,sys.stdout)
