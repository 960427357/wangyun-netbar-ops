#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
git 通道不通（代理 CONNECT 502 / 直连 443 超时）时，用 Git Data API 推送。

做法：本地把每个提交的「相对父提交的变更文件」做成 blob → 以远端上一棵树为 base_tree
合成新树 → 以远端上一提交为 parent 造提交。这样远端历史保持线性，
本地只是多出若干 tree 相同的孪生提交，等 git 通道恢复后 rebase 会自动跳过。

用法：python scripts/push-via-api.py <远端 main 当前 sha> <commit1> <commit2> ...
"""
import base64
import json
import subprocess
import sys

REPO = '960427357/wangyun-netbar-ops'


def git(*args):
    # core.quotepath=false：否则中文路径会被转成 \345\233... 八进制，ls-tree 查不到
    p = subprocess.run(['git', '-c', 'core.quotepath=false', *args], capture_output=True)
    if p.returncode != 0:
        raise SystemExit('git %s 失败: %s' % (' '.join(args), p.stderr.decode('utf-8', 'replace')))
    return p.stdout


def gh(args, payload=None):
    cmd = ['gh', 'api'] + args + (['--input', '-'] if payload is not None else [])
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    p = subprocess.run(cmd, input=data, capture_output=True)
    out = p.stdout.decode('utf-8', 'replace')
    if p.returncode != 0:
        raise SystemExit('gh api %s 失败: %s | %s' % (' '.join(args), out, p.stderr.decode('utf-8', 'replace')))
    return json.loads(out) if out.strip() else {}


def remote_commit(sha):
    return gh(['repos/%s/git/commits/%s' % (REPO, sha)])


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    base_sha = sys.argv[1]
    commits = sys.argv[2:]

    base = remote_commit(base_sha)
    prev_sha, prev_tree = base['sha'], base['tree']['sha']
    print('远端起点 %s tree=%s' % (prev_sha[:7], prev_tree[:7]))
    mapping = []

    for c in commits:
        msg = git('log', '-1', '--format=%B', c).decode('utf-8')
        parent = git('rev-parse', c + '^').decode().strip()
        # 变更清单：A/M/D
        raw = git('diff', '--name-status', parent, c).decode('utf-8')
        entries = []
        for line in raw.strip().splitlines():
            parts = line.split('\t')
            status, path = parts[0], parts[-1]
            if status.startswith('D'):
                entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': None})
                continue
            mode = git('ls-tree', c, '--', path).decode('utf-8').split()[0]
            blob = git('rev-parse', '%s:%s' % (c, path)).decode().strip()
            content = git('cat-file', 'blob', blob)
            r = gh(['-X', 'POST', 'repos/%s/git/blobs' % REPO], {
                'content': base64.b64encode(content).decode(),
                'encoding': 'base64',
            })
            entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': r['sha']})
        tree = gh(['-X', 'POST', 'repos/%s/git/trees' % REPO],
                  {'base_tree': prev_tree, 'tree': entries})
        nc = gh(['-X', 'POST', 'repos/%s/git/commits' % REPO],
                {'message': msg, 'tree': tree['sha'], 'parents': [prev_sha]})
        print('  %s → %s  %s（%d 个文件）' % (c[:7], nc['sha'][:7], msg.splitlines()[0][:50], len(entries)))
        mapping.append({'local': c, 'remote': nc['sha'], 'tree': tree['sha'], 'msg': msg})
        prev_sha, prev_tree = nc['sha'], tree['sha']

    # 快进 refs/heads/main（非强推：远端当前 sha 必须是新提交的祖先）
    gh(['-X', 'PATCH', 'repos/%s/git/refs/heads/main' % REPO],
       {'sha': prev_sha, 'force': False})
    print('main → %s' % prev_sha)

    with open('.api-push-map.json', 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
