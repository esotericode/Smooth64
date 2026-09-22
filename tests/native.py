"""Minimal host used by independent trajectory and native/WASM parity tests."""
import ctypes as C
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class State(C.Structure):
    _fields_ = [("position", C.c_float*3), ("velocity", C.c_float*3),
                ("speed", C.c_float), ("floor", C.c_float), ("yaw", C.c_float),
                ("intended", C.c_float), ("action", C.c_uint32), ("flags", C.c_uint32),
                ("tick", C.c_uint32), ("animation", C.c_int32), ("frame", C.c_int32),
                ("normal", C.c_float*3), ("health", C.c_int32), ("timer", C.c_int32)]


class Native:
    def __init__(self):
        self.lib = C.CDLL(str(ROOT / "build/libsmooth64.so"))
        self.lib.s64_reset.argtypes = [C.c_float]*3+[C.c_int]
        self.lib.s64_state.restype = C.POINTER(State)
        self.lib.s64_floor_height.argtypes = [C.c_float]*3
        self.lib.s64_floor_height.restype = C.c_float

    def world(self, triangles):
        self.lib.s64_clear_surfaces()
        for t in triangles:
            values = [v for vertex in t["vertices"] for v in vertex]
            if self.lib.s64_add_triangle(t["type"], *values) < 0:
                raise ValueError("Invalid test triangle")
        self.lib.s64_commit_surfaces()

    def reset(self, pos=(0, 0, 0), yaw=0):
        result = self.lib.s64_reset(*pos, yaw)
        if result: raise ValueError("No floor at spawn")
        return self.state()

    def state(self):
        return State.from_buffer_copy(self.raw())

    def raw(self):
        return C.string_at(self.lib.s64_state(), C.sizeof(State))

    def heal(self, amount):
        self.lib.s64_heal(amount)
        return self.state()

    def tick(self, x=0, y=0, buttons=0, yaw=0):
        self.lib.s64_tick(x,y,buttons,yaw)
        return self.state()


FLAT = [
    {"type":0,"vertices":[[-6000,0,-6000],[-6000,0,6000],[6000,0,6000]]},
    {"type":0,"vertices":[[-6000,0,-6000],[6000,0,6000],[6000,0,-6000]]},
]
