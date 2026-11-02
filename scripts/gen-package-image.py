#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-package-image.py — 生成套餐宣传图（800×800 方图，压到 ≤480KB）

套餐图位是必填项（提交时报「请上传套餐图片」），且限制 jpg/png/jpeg ≤500KB。
本脚本只负责画，体积交给 fit-image.py 收口（本脚本末尾会顺带调一次）。

用法：
    python scripts/gen-package-image.py                 # 生成内置的 3 张
    python scripts/gen-package-image.py --out D:/img/   # 指定输出目录
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write("缺 Pillow：pip install pillow\n")
    raise SystemExit(2)

W = H = 800
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

# 三张测试套餐图（名字要和后台建的套餐一致）
SPECS = [
    dict(file="pkg-afternoon", badge="超值套餐", title="单人下午茶",
         sub="生椰拿铁 + 蒜薄块", price="￥15", save="单买 ￥18",
         c1=(58, 38, 26), c2=(140, 92, 52), accent=(255, 205, 120)),
    dict(file="pkg-betel", badge="刚需组合", title="槟榔配饮料",
         sub="湘潭铺子槟榔 + 冰红茶", price="￥22", save="单买 ￥24",
         c1=(92, 22, 20), c2=(198, 74, 46), accent=(255, 214, 150)),
    dict(file="pkg-noodle", badge="通宵必备", title="网吧三件套",
         sub="红烧牛肉面 + 冰红茶1L + 蟹味棒", price="￥11", save="单买 ￥13",
         c1=(18, 26, 66), c2=(64, 88, 168), accent=(150, 220, 255)),
    dict(file="pkg-drink-self", badge="自选组合", title="饮料任选2件",
         sub="冰红茶 / 冰糖雪梨 / 茶π 任选", price="￥7", save="单买均价 ￥8",
         c1=(12, 54, 46), c2=(34, 128, 100), accent=(160, 255, 210)),
]


def font(size, bold=True):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def gradient(c1, c2):
    base = Image.new("RGB", (W, H), c1)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=(
            int(c1[0] + (c2[0] - c1[0]) * t),
            int(c1[1] + (c2[1] - c1[1]) * t),
            int(c1[2] + (c2[2] - c1[2]) * t),
        ))
    return base


def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def center_text(draw, y, text, f, fill):
    box = draw.textbbox((0, 0), text, font=f)
    w = box[2] - box[0]
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)
    return box[3] - box[1]


def make(spec, out_dir):
    img = gradient(spec["c1"], spec["c2"])
    d = ImageDraw.Draw(img)

    # 顶部徽标
    fb = font(34)
    bbox = d.textbbox((0, 0), spec["badge"], font=fb)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 30, 16
    bx0 = (W - bw) / 2 - pad_x
    by0 = 92
    rounded(d, [bx0, by0, bx0 + bw + pad_x * 2, by0 + bh + pad_y * 2],
            (bh + pad_y * 2) / 2, fill=spec["accent"])
    d.text(((W - bw) / 2, by0 + pad_y - bbox[1] / 2), spec["badge"], font=fb, fill=spec["c1"])

    # 主标题
    ft = font(96)
    center_text(d, 232, spec["title"], ft, (255, 255, 255))

    # 副标题（可能较长，降字号）
    fs = font(38, bold=False)
    while d.textbbox((0, 0), spec["sub"], font=fs)[2] > W - 100:
        fs = font(int(fs.size * 0.92), bold=False)
    center_text(d, 372, spec["sub"], fs, (255, 255, 255,))

    # 分隔线
    d.line([(W * 0.32, 470), (W * 0.68, 470)], fill=spec["accent"], width=4)

    # 价格
    fp = font(132)
    center_text(d, 508, spec["price"], fp, spec["accent"])

    # 原价对比
    fo = font(34, bold=False)
    center_text(d, 676, spec["save"], fo, (235, 235, 235))

    out = Path(out_dir) / f"{spec['file']}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="JPEG", quality=88, optimize=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="D:/tmp/pkg-img", help="输出目录")
    args = ap.parse_args()

    outs = [make(s, args.out) for s in SPECS]
    for o in outs:
        print(f"生成 {o}  {o.stat().st_size / 1024:.1f}KB")

    # 体积收口：交给 fit-image.py（目标 ≤480KB）
    fit = Path(__file__).with_name("fit-image.py")
    if fit.exists():
        subprocess.run([sys.executable, str(fit), *[str(o) for o in outs], "--square", "--width", "800"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
