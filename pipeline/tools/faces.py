"""Batch face detection for guest photos (OpenCV YuNet).

    python pipeline/tools/faces.py <model.onnx> <in.json> <out.json>

in.json:  [{"id": "...", "file": "path/to/image"}, ...]
out.json: {"<id>": {"w": W, "h": H, "faces": [[x, y, w, h, score], ...]}}  (largest first)

Coordinates are in the EXIF-oriented image's pixels. Images OpenCV can't decode are read
through Pillow; anything unreadable is reported with "error".
"""
import json
import sys

import cv2
import numpy as np

try:
    from PIL import Image, ImageOps
except ImportError:  # Pillow is optional
    Image = None


def load(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is not None:
        return img
    if Image is None:
        return None
    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def main():
    model, src, dst = sys.argv[1:4]
    with open(src, encoding="utf-8") as f:
        items = json.load(f)
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.75, 0.3, 5000)
    out = {}
    for it in items:
        img = load(it["file"])
        if img is None:
            out[it["id"]] = {"error": "unreadable"}
            continue
        h, w = img.shape[:2]
        scale = min(1.0, 800.0 / max(h, w))
        small = cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1 else img
        det.setInputSize((small.shape[1], small.shape[0]))
        try:
            _, faces = det.detect(small)
        except cv2.error:
            faces = None
        found = []
        if faces is not None:
            for f in faces:
                x, y, fw, fh = (float(v) / scale for v in f[:4])
                found.append([round(x, 1), round(y, 1), round(fw, 1), round(fh, 1), round(float(f[14]), 3)])
        found.sort(key=lambda r: -(r[2] * r[3]))
        out[it["id"]] = {"w": w, "h": h, "faces": found[:6]}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
