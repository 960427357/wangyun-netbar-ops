#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
git 通道不通时，用 Git Data API 强制推送一段「已重写」的历史。

与 push-via-api.py 的区别：
  - push-via-api.py 是「增量快进」：以远端树为 base_tree 重建本提交的改动。
  - 本脚本是「搬运已有提交」：直接复用本地每个提交的 tree（内容寻址，远端多半已有），
    只重建 commit 对象（因为改的是提交信息），最后 force 更新 ref。
    适合「只改提交信息、文件内容不变」的重写场景。

用法：
  python scripts/force-push-via-api.py <远端起点 sha> <commit1> <commit2> ... [--retag]

  <远端起点 sha> 必须是新链的第一个父提交，且远端确实有这个提交。
  --retag：把本地指向「本次重写的那些提交」的 tag，同步移动到远端新 sha（force）。
"""
import json
import os
import re
import subprocess
import sys

REPO = '960427357/wangyun-netbar-ops'
MAP = '.api-force-push-map.json'


def git(*args):
    p = subprocess.run(['git', '-c', 'core.quotepath=false', *args], capture_output=True)
    if p.returncode != 0:
        raise SystemExit('git %s 失败: %s' % (' '.join(args), p.stderr.decode('utf-8', 'replace')))
    return p.stdout.decode('utf-8', 'replace').strip()


def gh(args, payload=None):
    cmd = ['gh', 'api'] + args + (['--input', '-'] if payload is not None else [])
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    p = subprocess.run(cmd, input=data, capture_output=True)
    out = p.stdout.decode('utf-8', 'replace')
    if p.returncode != 0:
        raise SystemExit('gh api %s 失败: %s | %s' % (' '.join(args), out,
                                                     p.stderr.decode('utf-8', 'replace')))
    return json.loads(out) if out.strip() else {}


def tree_exists(sha):
    p = subprocess.run(['gh', 'api', 'repos/%s/git/trees/%s' % (REPO, sha)], capture_output=True)
    return p.returncode == 0


def main():
    argv = [a for a in sys.argv[1:] if a != '--retag']
    retag = '--retag' in sys.argv
    if len(argv) < 2:
        raise SystemExit(__doc__)
    base, commits = argv[0], argv[1:]

    base_sha = gh(['repos/%s/git/commits/%s' % (REPO, base)])['sha']
    print('远端起点 %s  %s' % (base_sha[:7], git('log', '-1', '--format=%s', base)[:40]))
    prev = base_sha
    mapping = []

    for c in commits:
        tree = git('rev-parse', '%s^{tree}' % c)
        msg = git('log', '-1', '--format=%B', c)
        if not tree_exists(tree):
            raise SystemExit('tree %s 远端不存在（%s），本脚本只适用于「文件内容不变」的重写，'
                             '请改用 push-via-api.py' % (tree[:7], c[:7]))
        nc = gh(['-X', 'POST', 'repos/%s/git/commits' % REPO],
                {'message': msg, 'tree': tree, 'parents': [prev]})
        print('  %s → %s  %s' % (c[:7], nc['sha'][:7], msg.splitlines()[0][:52]))
        mapping.append({'local': git('rev-parse', c), 'remote': nc['sha'], 'tree': tree})
        prev = nc['sha']

    gh(['-X', 'PATCH', 'repos/%s/git/refs/heads/main' % REPO],
       {'sha': prev, 'force': True})
    print('main → %s（已强制更新）' % prev)

    with open(MAP, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)

    if retag:
        loc2rem = {m['local']: m['remote'] for m in mapping}
        tags = git('tag', '-l').split('\n')
        for t in tags:
            if not t:
                continue
            target = git('rev-list', '-n', '1', t)
            if target in loc2rem:
                gh(['-X', 'PATCH', 'repos/%s/git/refs/tags/%s' % (REPO, t)],
                   {'sha': loc2rem[target], 'force': True})
                print('  tag %s → %s' % (t, loc2rem[target][:7]))
        print('tag 已同步 %d 个' % len([1 for t in tags if t and git('rev-list', '-n', '1', t) in loc2rem]))


if __name__ == '__main__':
    main()
