#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""git filter-branch 的 msg-filter：把提交信息里的真实场所名/姓名换成代号。

规则直接复用 scripts/scrub-venue-names.py，避免两处各写一份走偏。
标准输入 = 原提交信息，标准输出 = 改后提交信息。
"""
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    'scrub', os.path.join(HERE, 'scrub-venue-names.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def main():
    raw = io.open(sys.stdin.fileno(), encoding='utf-8', newline='').read()
    out = mod.scrub(raw)
    io.open(sys.stdout.fileno(), 'w', encoding='utf-8', newline='').write(out)


if __name__ == '__main__':
    main()
