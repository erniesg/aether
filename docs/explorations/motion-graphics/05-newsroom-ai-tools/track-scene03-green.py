#!/usr/bin/env python3
"""Bake the exact per-frame green-screen quad for scene 03 into src/scene03GreenTrack.ts.

Comp local frame f (30fps) shows public/assets/broadcast-scene-03.mp4 (24fps)
at source time t = 0.7 + f/30. For each comp frame the chroma mask is the
union of source frames floor(t*24) and floor(t*24)+1 so either rounding
direction Remotion picks is covered.

From ~f59 the screen exits the right frame edge, so the measured right
corners are clipped at x~1919; those frames get their true top-right /
bottom-right corners reconstructed by extending the measured top/bottom edge
lines to the width predicted by the (extrapolated) width/height ratio of the
last unclipped frames. Every emitted quad is offset outward by a safety
margin and numerically verified to contain the full chroma-mask convex hull.

Usage: python3 track-scene03-green.py [debug-dir]
"""
import sys

import cv2
import numpy as np

VIDEO = "public/assets/broadcast-scene-03.mp4"
OUT_TS = "src/scene03GreenTrack.ts"
N_FRAMES = 66
SRC_FPS = 24.0
COMP_FPS = 30.0
TRIM = 0.7
CLIP_X = 1918  # bbox right >= this means the screen is cut by the frame edge
BASE_MARGIN = 8.0
MAX_MARGIN = 24.0

LO = np.array([35, 40, 40])
HI = np.array([100, 255, 255])


def mask_for(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, LO, HI)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return np.zeros_like(m)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return ((labels == biggest) * 255).astype(np.uint8)


def order_quad(q):
    s = q.sum(axis=1)
    d = np.diff(q, axis=1).ravel()
    return np.array([q[np.argmin(s)], q[np.argmin(d)], q[np.argmax(s)], q[np.argmax(d)]])


def quad_from_hull(hull):
    peri = cv2.arcLength(hull, True)
    for eps in (0.02, 0.03, 0.05, 0.08):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4:
            return order_quad(approx.reshape(4, 2).astype(float))
    return order_quad(cv2.boxPoints(cv2.minAreaRect(hull)).astype(float))


def offset_quad(quad, margin):
    """Push each edge of the convex (clockwise, y-down) quad outward."""
    lines = []
    for i in range(4):
        a, b = quad[i], quad[(i + 1) % 4]
        d = b - a
        d = d / np.linalg.norm(d)
        n = np.array([d[1], -d[0]])  # outward for clockwise order in y-down coords
        lines.append((a + n * margin, d))
    out = []
    for i in range(4):
        (p1, d1) = lines[(i - 1) % 4]
        (p2, d2) = lines[i]
        A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
        t = np.linalg.solve(A, p2 - p1)
        out.append(p1 + d1 * t[0])
    return np.array(out)


def main():
    debug_dir = sys.argv[1] if len(sys.argv) > 1 else None
    cap = cv2.VideoCapture(VIDEO)
    if not cap.isOpened():
        raise SystemExit("cannot open " + VIDEO)

    needed = {}
    for f in range(N_FRAMES):
        i = int(np.floor((TRIM + f / COMP_FPS) * SRC_FPS))
        needed.setdefault(i, []).append(f)
        needed.setdefault(i + 1, []).append(f)
    src = {}
    idx = 0
    while idx <= max(needed):
        ok, frame = cap.read()
        if not ok:
            break
        if idx in needed:
            src[idx] = frame
        idx += 1
    cap.release()

    measured = []
    for f in range(N_FRAMES):
        i = int(np.floor((TRIM + f / COMP_FPS) * SRC_FPS))
        m = None
        for j in (i, i + 1):
            if j in src:
                mj = mask_for(src[j])
                m = mj if m is None else cv2.bitwise_or(m, mj)
        hull = cv2.convexHull(cv2.findNonZero(m)).reshape(-1, 2).astype(np.float32)
        x, y, w, h = cv2.boundingRect(cv2.findNonZero(m))
        measured.append({"quad": quad_from_hull(hull), "hull": hull, "right": x + w, "src": i})

    # width/height ratio trend from the last unclipped frames
    unclipped = [f for f in range(N_FRAMES) if measured[f]["right"] < CLIP_X]
    anchor = unclipped[-1]
    ratios = []
    for f in unclipped[-9:]:
        tl, tr, br, bl = measured[f]["quad"]
        ratios.append((f, np.linalg.norm(tr - tl) / np.linalg.norm(bl - tl)))
    slope, intercept = np.polyfit([r[0] for r in ratios], [r[1] for r in ratios], 1)
    tl_a, tr_a, br_a, bl_a = measured[anchor]["quad"]
    bot_over_top = np.linalg.norm(br_a - bl_a) / np.linalg.norm(tr_a - tl_a)

    final = []
    for f in range(N_FRAMES):
        quad = measured[f]["quad"].copy()
        clipped = measured[f]["right"] >= CLIP_X
        if clipped:
            tl, tr, br, bl = quad
            h = np.linalg.norm(bl - tl)
            ratio = slope * f + intercept
            d_top = (tr - tl) / np.linalg.norm(tr - tl)
            d_bot = (br - bl) / np.linalg.norm(br - bl)
            quad = np.array([
                tl,
                tl + d_top * ratio * h,
                bl + d_bot * ratio * h * bot_over_top,
                bl,
            ])

        margin = BASE_MARGIN
        while margin <= MAX_MARGIN:
            expanded = offset_quad(quad, margin)
            poly = expanded.astype(np.float32)
            check = measured[f]["hull"]
            if clipped:
                check = check[check[:, 0] < CLIP_X - 3]
            worst = min(
                cv2.pointPolygonTest(poly, (float(px), float(py)), True)
                for px, py in check
            )
            if worst >= 1.0:
                break
            margin += 2.0
        else:
            raise SystemExit(f"frame {f}: cannot cover hull within margin {MAX_MARGIN}")
        final.append(expanded)
        print(
            f"f={f:2d} src={measured[f]['src']:2d} margin={margin:4.1f} "
            f"{'clipped->reconstructed' if clipped else ''} "
            f"tl=({expanded[0][0]:7.1f},{expanded[0][1]:7.1f}) tr=({expanded[1][0]:7.1f},{expanded[1][1]:7.1f}) "
            f"br=({expanded[2][0]:7.1f},{expanded[2][1]:7.1f}) bl=({expanded[3][0]:7.1f},{expanded[3][1]:7.1f})"
        )
        if debug_dir:
            i = measured[f]["src"]
            dbg = src[i].copy()
            cv2.polylines(dbg, [expanded.astype(int)], True, (0, 0, 255), 2)
            cv2.imwrite(f"{debug_dir}/final-f{f:02d}.png", dbg)

    rows = ",\n".join(
        "  [[{}, {}], [{}, {}], [{}, {}], [{}, {}]]".format(
            *(round(float(v), 1) for pt in q for v in pt)
        )
        for q in final
    )
    ts = (
        "// Auto-generated by track-scene03-green.py — do not hand-edit.\n"
        "// Exact per-frame chroma-screen quad [tl, tr, br, bl] in 1920x1080 comp px\n"
        "// for scene 03 local frames 0..65 (source assets/broadcast-scene-03.mp4 at\n"
        "// t = 0.7 + f/30), expanded by a verified safety margin. Frames where the\n"
        "// screen exits the right frame edge have their true right corners\n"
        "// reconstructed so corner-pinned content keeps its proportions.\n"
        "export type Scene03Quad = [\n"
        "  [number, number],\n"
        "  [number, number],\n"
        "  [number, number],\n"
        "  [number, number],\n"
        "];\n\n"
        f"export const SCENE03_GREEN_QUADS: Scene03Quad[] = [\n{rows},\n];\n"
    )
    with open(OUT_TS, "w") as fh:
        fh.write(ts)
    print(f"wrote {OUT_TS}")


if __name__ == "__main__":
    main()
