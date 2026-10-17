#!/usr/bin/env python3
"""Bake the chroma key into broadcast-scene-03.mp4 by painting the green
screen with the monitor panel color (#0a1116), producing a normal H.264 mp4
(no alpha codec involved). The routine-screen UI is still corner-pinned on
top at render time; because the screen underneath is already panel-colored,
any preview-time drift between video and overlay shows dark-on-dark instead
of green.

Per frame:
  1. strict bright-chroma mask -> largest connected component = the screen
     (ignored below a minimum area so frames without the screen pass through
     untouched, and the pineapple's dark green leaves are never keyed)
  2. matte = looser green mask restricted to a dilated band around the screen
  3. soft-feathered composite of the panel color over the matte
  4. despill: inside a ring just outside the matte, clamp G to max(R, B)

Usage: python3 key-scene03-video.py [--frames-dir DIR]
Writes public/assets/broadcast-scene-03-keyed-dark.mp4 (audio copied from
the source file).
"""
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

SRC = "public/assets/broadcast-scene-03.mp4"
OUT = "public/assets/broadcast-scene-03-keyed-dark.mp4"
PANEL_BGR = np.array([22, 17, 10], dtype=np.float32)  # #0a1116

LO_STRICT = np.array([40, 120, 90])
HI_STRICT = np.array([90, 255, 255])
LO_LOOSE = np.array([35, 40, 40])
HI_LOOSE = np.array([100, 255, 255])
MIN_SCREEN_AREA = 5000


def key_frame(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    strict = cv2.inRange(hsv, LO_STRICT, HI_STRICT)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(strict, 8)
    if n <= 1:
        return img, 0
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    if stats[biggest, cv2.CC_STAT_AREA] < MIN_SCREEN_AREA:
        return img, 0
    core = ((labels == biggest) * 255).astype(np.uint8)

    region = cv2.dilate(core, np.ones((43, 43), np.uint8))
    loose = cv2.inRange(hsv, LO_LOOSE, HI_LOOSE)
    matte = cv2.bitwise_or(core, cv2.bitwise_and(loose, region))
    matte = cv2.morphologyEx(matte, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    alpha = cv2.GaussianBlur(matte, (5, 5), 0).astype(np.float32) / 255.0
    alpha3 = alpha[..., None]
    out = img.astype(np.float32) * (1 - alpha3) + PANEL_BGR * alpha3
    out = out.astype(np.uint8)

    # despill ring: neutralize residual green cast just outside the matte
    ring = cv2.subtract(cv2.dilate(matte, np.ones((9, 9), np.uint8)), matte)
    ys, xs = np.nonzero(ring)
    if len(ys):
        px = out[ys, xs].astype(np.int16)
        g_cap = np.maximum(px[:, 0], px[:, 2])  # max(B, R)
        px[:, 1] = np.minimum(px[:, 1], g_cap)
        out[ys, xs] = px.astype(np.uint8)

    return out, int(cv2.countNonZero(matte))


def main():
    frames_dir = None
    if "--frames-dir" in sys.argv:
        frames_dir = sys.argv[sys.argv.index("--frames-dir") + 1]
        os.makedirs(frames_dir, exist_ok=True)
    tmp = frames_dir or tempfile.mkdtemp(prefix="keyed-frames-")

    cap = cv2.VideoCapture(SRC)
    if not cap.isOpened():
        raise SystemExit("cannot open " + SRC)
    i = 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        keyed, matte_px = key_frame(img)
        cv2.imwrite(os.path.join(tmp, f"{i:04d}.png"), keyed)
        print(f"frame {i:3d}: keyed {matte_px} px")
        i += 1
    cap.release()

    cmd = [
        "ffmpeg", "-y",
        "-framerate", "24",
        "-i", os.path.join(tmp, "%04d.png"),
        "-i", SRC,
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-crf", "16", "-preset", "slow",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-shortest",
        OUT,
    ]
    subprocess.run(cmd, check=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
