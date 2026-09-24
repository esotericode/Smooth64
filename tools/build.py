#!/usr/bin/env python3
"""Build the same C core as a native library or portable WebAssembly reactor."""
import argparse
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor/libsm64/src"
EXPORTS = ["s64_clear_surfaces", "s64_add_triangle", "s64_commit_surfaces",
           "s64_reset", "s64_tick", "s64_state", "s64_state_size", "s64_floor_height", "s64_heal",
           "s64_sound_count", "s64_sounds"]


def build(target, compiler=None):
    (ROOT / "build").mkdir(exist_ok=True)
    sources = sorted(str(p) for p in VENDOR.rglob("*.c"))
    sources += [str(ROOT / "core/host.c"), str(ROOT / "core/silent_host.c")]
    flags = ["-std=gnu11", "-O2", "-fno-strict-aliasing", "-fwrapv", "-ffp-contract=off",
             "-fno-fast-math", "-ffunction-sections", "-fdata-sections", "-fvisibility=hidden",
             "-DVERSION_US", "-DGBI_FLOATS", "-DNO_SEGMENTED_MEMORY",
             "-Wno-incompatible-pointer-types", "-Wno-int-conversion",
             "-I" + str(VENDOR), "-I" + str(VENDOR / "decomp/include")]
    if target == "wasm":
        sdk = os.environ.get("WASI_SDK_PATH")
        cmd = shlex.split(compiler or (str(Path(sdk) / "bin/clang") if sdk else "clang"))
        flags += ["--target=wasm32-wasi", "-mexec-model=reactor"]
        # Memory starts at 4 MB and grows as a world needs, with no ceiling of our own.
        flags += ["-Wl,--gc-sections", "-Wl,-z,stack-size=1048576", "-Wl,--initial-memory=4194304"]
        flags += ["-Wl,--export=" + symbol for symbol in EXPORTS]
        out = ROOT / "web/smooth64.wasm"
    else:
        cmd = shlex.split(compiler or os.environ.get("CC", "cc"))
        flags += ["-shared", "-fPIC", "-Wl,--gc-sections", "-Wl,--no-undefined"]
        out = ROOT / "build/libsmooth64.so"
    env = {**os.environ, "TMPDIR": str(ROOT / "build")}
    subprocess.run(cmd + flags + sources + ["-lm", "-o", str(out)], check=True, cwd=ROOT, env=env)
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=["native", "wasm"])
    parser.add_argument("--compiler")
    args = parser.parse_args()
    build(args.target, args.compiler)
