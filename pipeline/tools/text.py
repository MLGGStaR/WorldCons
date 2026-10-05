"""Batch text detection for guest photos (OpenCV DB detector, PP-OCRv3 English model).

    python pipeline/tools/text.py <model.onnx> <in.json> <out.json>

in.json:  [{"id": "...", "file": "path/to/image"}, ...]
out.json: {"<id>": {"w": W, "h": H, "boxes": [[x, y, w, h], ...]}}

Boxes bound the printed text lines (names, captions, con logos) in the EXIF-oriented
image's pixels, the same space as faces.py, so a crop can be framed clear of them.
"""
import json
import sys

import cv2
import numpy as np

try:
    from PIL import Image, ImageOps
except ImportError:  # Pillow is optional
    Image = None

LONG_SIDE = 736  # the model's native input; both sides must be multiples of 32


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
    model_path, src, dst = sys.argv[1:4]
    with open(src, encoding="utf-8") as f:
        items = json.load(f)
    model = cv2.dnn.TextDetectionModel_DB(cv2.dnn.readNet(model_path))
    model.setBinaryThreshold(0.3)
    model.setPolygonThreshold(0.5)
    model.setUnclipRatio(2.0)
    model.setMaxCandidates(200)
    mean = (122.67891434, 116.66876762, 104.00698793)
    out = {}
    for it in items:
        img = load(it["file"])
        if img is None:
            out[it["id"]] = {"error": "unreadable"}
            continue
        h, w = img.shape[:2]
        scale = LONG_SIDE / max(h, w)
        iw = max(32, int(round(w * scale / 32.0)) * 32)
        ih = max(32, int(round(h * scale / 32.0)) * 32)
        model.setInputParams(1.0 / 255.0, (iw, ih), mean, False, False)
        try:
            res = model.detect(img)
        except cv2.error:
            res = None
        polys = res[0] if isinstance(res, tuple) else res
        boxes = []
        for p in polys if polys is not None else []:
            pts = np.asarray(p, dtype=np.float32).reshape(-1, 2)
            x0, y0 = pts.min(axis=0)
            x1, y1 = pts.max(axis=0)
            x0, y0 = max(0.0, float(x0)), max(0.0, float(y0))
            x1, y1 = min(float(w), float(x1)), min(float(h), float(y1))
            if x1 - x0 < 4 or y1 - y0 < 3:
                continue
            boxes.append([round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)])
        out[it["id"]] = {"w": w, "h": h, "boxes": boxes}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
