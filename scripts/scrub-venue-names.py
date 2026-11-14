#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
仓库脱敏：把真实场所名 / 会员姓名替换成「场所A~F」代号。

用法：
  python scripts/scrub-venue-names.py            # dry-run，打印改动 + 扫描改动后的残留
  python scripts/scrub-venue-names.py --apply    # 写回
  python scripts/scrub-venue-names.py --scan     # 只扫全仓残留，不改任何东西

映射从仓库**外部**的 JSON 读取，默认 `../.scrub-private/venue-map.json`，
也可用环境变量 SCRUB_VENUE_MAP 指定绝对路径。

🔴 为什么映射不写在本文件里：
  本文件是要提交进仓库的，而仓库是公开的。把「真实名称 → 代号」的对照表写在
  代码里，等于把要藏的东西原样公开——这比不脱敏更糟，因为它是一张干净的结构化清单。
  所以映射必须留在仓库之外（本目录上一级的 .scrub-private/），只在本机存在。

映射文件结构：
  {
    "key":     "正则，命中即视为未脱敏",
    "rules":   [["真实名称", "代号"], ...],      # 全局替换，长串在前
    "phrases": [["原文片段", "替换后片段"], ...]  # 短语级，先于 rules 执行
  }
phrases 先于 rules 的原因：裸称（不带区名的品牌名）在不同段落可能指不同门店，
只能靠上下文短语定指，先做全局替换就再也匹配不上短语了。
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_PATH = os.environ.get('SCRUB_VENUE_MAP') or os.path.join(
    os.path.dirname(ROOT), '.scrub-private', 'venue-map.json')

TARGETS = ['CHANGELOG.md', 'SKILL.md', 'README.md',
           'references/09-门店资料.md', 'references/12-团购上架.md']
_dn = os.path.join(ROOT, 'dist/notes')
if os.path.isdir(_dn):
    for _f in sorted(os.listdir(_dn)):
        if _f.endswith('.md'):
            TARGETS.append('dist/notes/' + _f)

# 扫描范围比修改范围宽：防止真实名称躲进脚本、配置、json
SCAN_EXT = ('.md', '.js', '.py', '.json', '.sh', '.txt', '.yml', '.yaml')
SCAN_SKIP_DIRS = {'.git', 'node_modules', 'dist/bin'}


def load_map():
    if not os.path.exists(MAP_PATH):
        sys.exit(
            '找不到脱敏映射：%s\n'
            '它必须放在仓库之外（含真实名称的对照表绝不能进仓库）。\n'
            '可用环境变量 SCRUB_VENUE_MAP 指定绝对路径。' % MAP_PATH)
    with io.open(MAP_PATH, encoding='utf-8') as f:
        m = json.load(f)
    rules = [tuple(x) for x in m.get('rules', [])]
    phrases = [tuple(x) for x in m.get('phrases', [])]
    key = re.compile(m['key'])
    return rules, phrases, key


RULES, PHRASES, KEY = load_map()


def scrub(text):
    for a, b in PHRASES + RULES:
        text = text.replace(a, b)
    return text


def iter_repo_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SCAN_SKIP_DIRS]
        for fn in filenames:
            if fn.endswith(SCAN_EXT):
                yield os.path.relpath(os.path.join(dirpath, fn), ROOT).replace('\\', '/')


def scan():
    """全仓扫描：返回 [(相对路径, 行号, 行内容)]"""
    hits = []
    for rel in iter_repo_files():
        try:
            lines = io.open(os.path.join(ROOT, rel), encoding='utf-8').read().split('\n')
        except (UnicodeDecodeError, OSError):
            continue
        for i, ln in enumerate(lines, 1):
            if KEY.search(ln):
                hits.append((rel, i, ln.strip()[:130]))
    return hits


def main():
    if '--scan' in sys.argv:
        hits = scan()
        for rel, i, ln in hits:
            print('  %s L%d: %s' % (rel, i, ln))
        print('全仓残留 %d 行' % len(hits))
        return

    apply = '--apply' in sys.argv
    total = 0
    transformed = {}
    for rel in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        with io.open(path, encoding='utf-8') as f:
            raw = f.read()
        lines = raw.split('\n')
        out = [scrub(ln) for ln in lines]
        changed = [(i, lines[i - 1], out[i - 1]) for i in range(1, len(lines) + 1)
                   if lines[i - 1] != out[i - 1]]
        if not changed:
            continue
        total += len(changed)
        transformed[rel] = (path, out)
        print('===== %s  (%d 行)' % (rel, len(changed)))
        for i, old, new in changed:
            print('  L%-5d - %s' % (i, old.strip()[:160]))
            print('         + %s' % new.strip()[:160])
        if apply:
            with io.open(path, 'w', encoding='utf-8', newline='') as f:
                f.write('\n'.join(out))
    print('\n合计 %d 行 %s' % (total, '（已写回）' if apply else '（dry-run，未改动）'))

    print('\n--- 改动后残留扫描（全仓） ---')
    hits = []
    for rel, i, ln in scan():
        if not apply and rel in transformed:
            # dry-run：文件还没写回，用内存里的改后内容判断这一行
            if not KEY.search(transformed[rel][1][i - 1]):
                continue
        hits.append((rel, i, ln))
    for rel, i, ln in hits:
        print('  %s L%d: %s' % (rel, i, ln))
    print('残留 %d 行' % len(hits))


if __name__ == '__main__':
    main()
