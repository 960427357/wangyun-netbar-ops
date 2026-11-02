#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fit-image.py — 上传前压图，保证单张 ≤ 500KB（旺云全站上传硬上限）

适用：商品名称图片、商品分类图片、外设设备图片、移动端室内/环境图、
      团购封面、活动图，以及 AI 生成图之后的上传前处理。

用法：
    # 单张，默认输出到同目录 upload/ 下，转 jpg、长边 800、质量自适应
    python scripts/fit-image.py D:/img/coffee.png

    # 多张 / 整个目录
    python scripts/fit-image.py D:/img/*.png D:/shots/

    # 商品图：裁成正方形（客户端是方图位）
    python scripts/fit-image.py D:/img/coffee.png --square

    # 环境图：宽高比 16:9，长边 1280
    python scripts/fit-image.py D:/shots/ --ratio 16:9 --width 1280

    # 只体检不写文件，超标的报出来
    python scripts/fit-image.py D:/img/ --check

规则（写死，别改）：
  - 目标上限 480KB（不是 500KB）。平台按「≤500KB」判，留 4% 余量防服务端重打包后超标。
  - 原图已达标且格式合规（jpg/png/jpeg）→ **原样保留，不重编码**，避免无谓掉画质。
  - 只输出 jpg；png 透明底合成白底（后台缩略图背景是白的）。
  - 永不覆盖原文件，永远另存。默认 `原目录/upload/<原名>.jpg`。
  - 每张都会实测字节数，压不到 480KB 就继续降质量/缩边长，直到达标或触发下限（边长 320、质量 50）。

退出码：0 = 全部达标；1 = 有文件没压下来；2 = 用法/依赖错误。
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.stderr.write("缺 Pillow。装：pip install pillow\n")
    raise SystemExit(2)

DEFAULT_LIMIT_KB = 480          # 硬上限 500KB，留余量
HARD_CEILING_KB = 500           # 平台原文上限，永远不许越过
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
QUALITY_LADDER = [86, 82, 78, 74, 70, 66, 62, 58, 54, 50]
MIN_EDGE = 320


def kb(nbytes: int) -> float:
    return round(nbytes / 1024, 1)


def parse_ratio(text: str) -> float | None:
    if not text:
        return None
    for sep in (":", "/", "x", "X"):
        if sep in text:
            a, b = text.split(sep, 1)
            return float(a) / float(b)
    return float(text)


def crop_to_ratio(img: Image.Image, ratio: float | None, square: bool) -> Image.Image:
    if square:
        ratio = 1.0
    if not ratio:
        return img
    w, h = img.size
    cur = w / h
    if abs(cur - ratio) < 1e-3:
        return img
    if cur > ratio:                      # 太宽 → 裁左右
        new_w = int(round(h * ratio))
        left = (w - new_w) // 2
        return img.crop((left, 0, left + new_w, h))
    new_h = int(round(w / ratio))        # 太高 → 裁上下
    top = (h - new_h) // 2
    return img.crop((0, top, w, top + new_h))


def flatten(img: Image.Image) -> Image.Image:
    """透明底合成白底，统一转 RGB。"""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return img.convert("RGB")


def encode(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def compress(src: Path, limit_bytes: int, width: int | None,
             ratio: float | None, square: bool) -> tuple[bytes, dict]:
    with Image.open(src) as raw:
        img = ImageOps.exif_transpose(raw)      # 手机拍的图先摆正
        original_size = img.size
        img = flatten(img)
        img = crop_to_ratio(img, ratio, square)

        # 先把长边收到 --width（没有就按原尺寸），之后每一轮只按 scale 继续缩
        base = img
        if width and max(base.size) > width:
            r = width / max(base.size)
            base = base.resize(
                (max(1, int(base.width * r)), max(1, int(base.height * r))), Image.LANCZOS
            )

        scale = 1.0
        best: bytes | None = None
        best_meta: dict = {}

        for _round in range(12):
            if scale >= 0.999:
                shot = base
            else:
                shot = base.resize(
                    (max(1, int(base.width * scale)), max(1, int(base.height * scale))),
                    Image.LANCZOS,
                )
            for q in QUALITY_LADDER:
                data = encode(shot, q)
                if best is None or len(data) < len(best):
                    best, best_meta = data, {"w": shot.width, "h": shot.height, "q": q}
                if len(data) <= limit_bytes:
                    return data, {**best_meta, "original_size": original_size,
                                  "attempts": {"quality": q, "scale": round(scale, 2)}}
            scale *= 0.85
            if min(base.size) * scale < MIN_EDGE:
                break

        return best or b"", {**best_meta, "original_size": original_size,
                             "attempts": {"quality": best_meta.get("q"), "scale": round(scale, 2)}}


def collect(patterns: list[str]) -> list[Path]:
    found: list[Path] = []
    for pat in patterns:
        p = Path(pat)
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.suffix.lower() in EXTS:
                    found.append(f)
        elif any(ch in pat for ch in "*?["):
            for f in sorted(glob.glob(pat, recursive=True)):
                fp = Path(f)
                if fp.suffix.lower() in EXTS:
                    found.append(fp)
        elif p.suffix.lower() in EXTS:
            found.append(p)
    # 去重保序
    seen, out = set(), []
    for f in found:
        key = str(f.resolve()).lower()
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(
        description="压到 500KB 以内再上传（旺云全站图片硬上限）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="例：python scripts/fit-image.py D:/img/coffee.png --square",
    )
    ap.add_argument("paths", nargs="+", help="图片文件 / 目录 / 通配符")
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT_KB,
                    help=f"目标上限 KB，默认 {DEFAULT_LIMIT_KB}，不得大于 {HARD_CEILING_KB}")
    ap.add_argument("--width", type=int, default=None, help="长边像素上限（如 800 商品图 / 1280 环境图）")
    ap.add_argument("--ratio", default=None, help="裁切宽高比，如 16:9")
    ap.add_argument("--square", action="store_true", help="居中裁成正方形（商品图位是方的）")
    ap.add_argument("--out", default=None, help="输出目录，默认 <原目录>/upload")
    ap.add_argument("--check", action="store_true", help="只体检，不写文件")
    ap.add_argument("--json", action="store_true", help="机器可读输出")
    args = ap.parse_args()

    if args.limit > HARD_CEILING_KB:
        sys.stderr.write(f"--limit 不能超过 {HARD_CEILING_KB}KB（平台硬上限）\n")
        return 2

    files = collect(args.paths)
    if not files:
        sys.stderr.write("没找到图片（支持 jpg/jpeg/png/webp/bmp/tif）\n")
        return 2

    limit_bytes = args.limit * 1024
    ratio = parse_ratio(args.ratio)
    rows, failed = [], 0

    for src in files:
        try:
            raw_size = src.stat().st_size
            ext_ok = src.suffix.lower() in {".jpg", ".jpeg", ".png"}
            # 已达标 + 格式合规 + 不需要裁切/改尺寸 → 原样保留
            if raw_size <= limit_bytes and ext_ok and not (args.square or ratio or args.width):
                rows.append({"file": str(src), "from_kb": kb(raw_size), "to_kb": kb(raw_size),
                             "size": "原样保留", "ok": True, "out": str(src)})
                continue

            data, meta = compress(src, limit_bytes, args.width, ratio, args.square)
            ok = bool(data) and len(data) <= limit_bytes
            out_path = ""
            if not args.check and data:
                out_dir = Path(args.out) if args.out else src.parent / "upload"
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = str(out_dir / (src.stem + ".jpg"))
                Path(out_path).write_bytes(data)
            if not ok:
                failed += 1
            rows.append({
                "file": str(src),
                "from_kb": kb(raw_size),
                "to_kb": kb(len(data)) if data else 0,
                "size": f"{meta.get('w', '?')}x{meta.get('h', '?')} q{meta.get('attempts', {}).get('quality', '?')}",
                "ok": ok,
                "out": out_path,
            })
        except Exception as exc:                      # noqa: BLE001
            failed += 1
            rows.append({"file": str(src), "from_kb": kb(src.stat().st_size) if src.exists() else 0,
                         "to_kb": 0, "size": f"ERROR {exc}", "ok": False, "out": ""})

    if args.json:
        print(json.dumps({"limit_kb": args.limit, "files": rows}, ensure_ascii=False, indent=2))
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:                             # noqa: BLE001
            pass
        print(f"上限 {args.limit}KB（平台硬上限 {HARD_CEILING_KB}KB）  共 {len(rows)} 张"
              f"{'  [体检模式，未写文件]' if args.check else ''}\n")
        for r in rows:
            flag = "OK " if r["ok"] else "XX "
            print(f"{flag}{r['from_kb']:>8.1f}KB → {r['to_kb']:>7.1f}KB  {r['size']:<18} {Path(r['file']).name}")
            if r["out"] and r["out"] != r["file"]:
                print(f"     → {r['out']}")
        print(f"\n达标 {len(rows) - failed} / {len(rows)}")
        if failed:
            print("有文件压不下来，见上面 XX 行：换源图、裁掉边角，或降 --width 后重试。")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
