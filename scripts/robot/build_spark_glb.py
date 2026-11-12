#!/usr/bin/env python3
"""Pack the Zeref Spark robot CAD (The Beast Box repo, "beast spark robot/out/stl/assembly_coords")
into one GLB for the Pages 3D viewer. Deterministic: same STLs -> byte-identical GLB.

Usage: build_spark_glb.py <path to "beast spark robot"> <out.glb>

Source: NavisWORLD/The-beast-box- "beast spark robot" (ZEREF SPARK companion robot CAD package v0.2,
Apache-2.0, CONCEPT DESIGN / NOT BUILT HARDWARE). Geometry is used as exported by its CadQuery build
(no remodelling): each part's binary STL is welded to indexed triangles and given a PBR material that
follows the package's own render colours (cad/render.py). Units stay millimetres (root node scales to m).
"""
import json, struct, sys
from pathlib import Path
import numpy as np

# PBR materials, colours from cad/render.py style()
MATS = {
 "shell_front": dict(c="#1f2747", m=0.15, r=0.32),
 "navy":        dict(c="#161c33", m=0.15, r=0.38),
 "visor":       dict(c="#04060b", m=0.0, r=0.04, a=0.62),
 "cyan_glow":   dict(c="#3ff4ff", m=0.0, r=0.3, e="#3ff4ff"),
 "magenta_glow":dict(c="#ff3fd8", m=0.0, r=0.3, e="#ff3fd8"),
 "lens":        dict(c="#c43cff", m=0.0, r=0.15, e="#c43cff"),
 "rim":         dict(c="#7a3cff", m=0.0, r=0.35, e="#7a3cff"),
 "pedestal":    dict(c="#1b1b22", m=0.05, r=0.78),
 "tube":        dict(c="#bfe9ff", m=0.0, r=0.03, a=0.32),
 "cap":         dict(c="#0b0e1a", m=0.35, r=0.22),
 "frame":       dict(c="#5a6280", m=0.2, r=0.55),
 "core":        dict(c="#0d1020", m=0.3, r=0.28),
 "shield":      dict(c="#1a2140", m=0.2, r=0.4),
 "plug":        dict(c="#d9dde8", m=0.0, r=0.5),
 "crystal":     dict(c="#b48cff", m=0.0, r=0.08, a=0.78, e="#5a2cff"),
 "window":      dict(c="#cfefff", m=0.0, r=0.03, a=0.35),
 "led_white":   dict(c="#ffffff", m=0.0, r=0.3, e="#ffffff"),
 "led_uv":      dict(c="#8a2cff", m=0.0, r=0.3, e="#8a2cff"),
 "led_ir":      dict(c="#5a0010", m=0.0, r=0.3, e="#5a0010"),
 "pcb":         dict(c="#1e7a4e", m=0.1, r=0.5),
 "led_ring":    dict(c="#e8e8ff", m=0.1, r=0.4),
}

def mat_for(n):
    if "crystal_sample" in n: return "crystal"
    if "window" in n: return "window"
    if "light_shield" in n: return "shield"
    if "station_led_plug" in n: return "plug"
    if "sensor_mount" in n or "driver_bay" in n: return "frame"
    if "led_uv365" in n: return "led_uv"
    if "led_ir940" in n: return "led_ir"
    if "led_white" in n: return "led_white"
    if "visor" in n: return "visor"
    if "eye_lightpipe" in n or "ring_diffuser" in n: return "cyan_glow"
    if "accent_lightpipe" in n: return "magenta_glow"
    if "center_lens" in n: return "lens"
    if "rim_diffuser" in n: return "rim"
    if "pedestal" in n: return "pedestal"
    if "support_tube" in n: return "tube"
    if "pod_cap" in n: return "cap"
    if "bulkhead" in n or "sled" in n or "carrier" in n: return "frame"
    if "chest_core_housing" in n or "neck" in n: return "core"
    if "shell" in n or "ear_" in n: return "shell_front" if "front" in n else "navy"
    if n.startswith("PX_"): return "led_ring" if "led" in n else "pcb"
    return "navy"

# purchased-part proxies worth seeing through the visor / lenses / station window
PROXIES = ["PX_led_ring12_chest", "PX_led_ring12_podL", "PX_led_ring12_podR", "PX_led_eyeL", "PX_led_eyeR",
           "PX_crystal_sample", "PX_crystal_window_borosilicate", "PX_led_white", "PX_led_uv365", "PX_led_ir940",
           "PX_RB-001_esp32s3_devkitc1", "PX_speaker28", "PX_lipo_503450_protected", "PX_AS7341_breakout"]

def read_stl(p):
    b = p.read_bytes()
    n = struct.unpack_from("<I", b, 80)[0]
    if 84 + n * 50 != len(b):
        raise SystemExit(f"{p.name}: not a binary STL")
    rec = np.frombuffer(b, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n, offset=84)
    tri = rec["v"].reshape(-1, 3).astype(np.float64)
    key = np.round(tri, 4)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    idx = inv.reshape(-1).astype(np.uint32)
    faces = idx.reshape(-1, 3)
    keep = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    return uniq.astype(np.float32), faces[keep].reshape(-1)

def rgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [round((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4, 5) for x in c]  # sRGB -> linear

def main(src, out):
    d = Path(src) / "out" / "stl" / "assembly_coords"
    files = sorted(p for p in d.glob("*.stl") if "ZS-605" not in p.name)  # dark plug lives in its pocket off-model (as in render.py)
    files += [d / "proxy" / f"{n}.stl" for n in PROXIES if (d / "proxy" / f"{n}.stl").exists()]
    mat_names = list(MATS)
    materials = []
    for k in mat_names:
        m = MATS[k]; base = rgb(m["c"]) + [m.get("a", 1.0)]
        mm = {"name": k, "pbrMetallicRoughness": {"baseColorFactor": base, "metallicFactor": m["m"], "roughnessFactor": m["r"]}}
        if "a" in m: mm["alphaMode"] = "BLEND"; mm["doubleSided"] = True
        if "e" in m: mm["emissiveFactor"] = rgb(m["e"])
        materials.append(mm)
    buf, views, accs, meshes, nodes = bytearray(), [], [], [], []
    def add(data, target, comp, typ, count, mn=None, mx=None):
        while len(buf) % 4: buf.append(0)
        views.append({"buffer": 0, "byteOffset": len(buf), "byteLength": len(data), "target": target})
        buf.extend(data)
        a = {"bufferView": len(views) - 1, "componentType": comp, "count": count, "type": typ}
        if mn is not None: a["min"], a["max"] = mn, mx
        accs.append(a); return len(accs) - 1
    tris = 0
    for p in files:
        v, f = read_stl(p)
        name = p.stem
        pa = add(v.tobytes(), 34962, 5126, "VEC3", len(v), [float(x) for x in v.min(0)], [float(x) for x in v.max(0)])
        if len(v) < 65536:
            ia = add(f.astype(np.uint16).tobytes(), 34963, 5123, "SCALAR", len(f))
        else:
            ia = add(f.astype(np.uint32).tobytes(), 34963, 5125, "SCALAR", len(f))
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": pa}, "indices": ia, "material": mat_names.index(mat_for(name))}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
        tris += len(f) // 3
    while len(buf) % 4: buf.append(0)
    root = {"name": "ZEREF_SPARK", "children": list(range(len(nodes))), "scale": [0.001] * 3,
            "rotation": [-0.7071068, 0, 0, 0.7071068]}  # CAD Z-up -> glTF Y-up
    nodes.append(root)
    gltf = {"asset": {"version": "2.0", "generator": "NavisWORLD build_spark_glb.py",
                      "copyright": "Zeref Spark CAD v0.2 from NavisWORLD/The-beast-box- (Apache-2.0). CONCEPT DESIGN / NOT BUILT HARDWARE."},
            "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": meshes, "materials": materials,
            "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(buf)}],
            "extras": {"parts": len(files), "triangles": tris, "source": "beast spark robot/out/stl/assembly_coords"}}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(buf)
    Path(out).write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
                          + struct.pack("<II", len(buf), 0x004E4942) + bytes(buf))
    print(f"{out}: {len(files)} parts, {tris} triangles, {total/1e6:.2f} MB")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
