#!/usr/bin/env bash
# 打包技能包为可分发 zip（用于 GitHub Release 附件）
#
#   ./scripts/build-release.sh              # 打当前 HEAD，版本号从 SKILL.md 读
#   ./scripts/build-release.sh v1.6.30       # 打指定 tag
#   ./scripts/build-release.sh --all         # 从 v1.6.25 起所有 tag 各打一个
#
# 用 git archive 而不是 zip -r：只打**已提交**的内容，不受工作区未提交改动影响，
# 同一个 tag 任何时候重新打出来的包都一模一样（除时间戳外）。
#
# 产物：dist/<tag>.zip，内含顶层目录 wangyun-netbar-ops-<tag>/
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_NAME="wangyun-netbar-ops"
OUT_DIR="dist"
mkdir -p "$OUT_DIR"

# 版本号：优先读 SKILL.md 的 version 字段（工作区版），tag 模式则用 tag 名
version_of_head() {
  grep -m1 '^version:' SKILL.md | sed 's/^version:[[:space:]]*//' | tr -d '\r'
}

pack() {
  local tag="$1"
  local out="$OUT_DIR/${REPO_NAME}-${tag}.zip"
  rm -f "$out"
  git archive \
    --format=zip \
    --prefix="${REPO_NAME}-${tag}/" \
    --output="$out" \
    "$tag"
  local size
  size=$(du -h "$out" | cut -f1)
  local sha
  sha=$(sha256sum "$out" | cut -d' ' -f1)
  printf '%-28s %6s  sha256:%s\n' "$tag" "$size" "$sha"
}

case "${1:-}" in
  --all)
    echo "打包 v1.6.25 起全部 tag → $OUT_DIR/"
    for t in $(git tag -l 'v1.6.*' --sort=version:refname \
                 | awk -F. '{ if ($2==1 && $3>=25) print }'); do
      pack "$t"
    done
    ;;
  "")
    v="v$(version_of_head)"
    if ! git rev-parse -q --verify "refs/tags/$v" >/dev/null; then
      echo "✗ 本地没有 tag $v，先 git tag 再打包（SKILL.md 里的 version 字段要对得上）" >&2
      exit 1
    fi
    pack "$v"
    ;;
  *)
    pack "$1"
    ;;
esac
