#!/usr/bin/env python3
"""JSON in, exact state bytes per tick out. Used for cross-compiler parity."""
import json
import sys
from native import Native

data=json.load(sys.stdin)
core=Native()
core.world(data['triangles'])
core.reset(data['position'],data['yaw'])
result=[]
for frame in data['inputs']:
    core.tick(frame['x'],frame['y'],frame['buttons'],frame['yaw'])
    result.append(core.raw().hex())
json.dump(result,sys.stdout)
