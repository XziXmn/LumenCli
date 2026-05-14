#!/usr/bin/env bash
set -euo pipefail

# LumenCli Upstream Merge Script
# 从 earendil-works/pi-mono 合并上游更新

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
MANIFEST="$REPO_ROOT/CUSTOMIZATION_MANIFEST.md"
MERGE_PROMPT="$SCRIPT_DIR/upstream-merge-prompt.md"

cd "$REPO_ROOT"

# 检查 upstream remote 是否存在
if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo "Error: upstream remote not found. Add it with:"
  echo "  git remote add upstream https://github.com/earendil-works/pi-mono.git"
  exit 1
fi

# 检查上次合并时间
LAST_MERGE=$(git log --oneline --merges --grep="upstream" -1 --format="%ci" 2>/dev/null || echo "")
if [ -n "$LAST_MERGE" ]; then
  LAST_MERGE_EPOCH=$(date -d "$LAST_MERGE" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S %z" "$LAST_MERGE" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  DAYS_SINCE=$(( (NOW_EPOCH - LAST_MERGE_EPOCH) / 86400 ))
  echo "上次合并: $LAST_MERGE ($DAYS_SINCE 天前)"
  if [ "$DAYS_SINCE" -gt 14 ]; then
    echo "⚠️  距离上次合并已超过 14 天，建议尽快合并"
  fi
else
  echo "未找到之前的合并记录"
fi

echo ""
echo "=== 获取上游更新 ==="
git fetch "$UPSTREAM_REMOTE"

# 显示上游有多少新 commits
AHEAD=$(git rev-list HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --count)
echo "上游有 $AHEAD 个新 commit"

if [ "$AHEAD" -eq 0 ]; then
  echo "✅ 已是最新，无需合并"
  exit 0
fi

echo ""
echo "=== 尝试合并 ==="
if git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-commit --no-ff 2>/dev/null; then
  echo "✅ 合并无冲突"
  echo ""
  echo "变更文件:"
  git diff --cached --stat
  echo ""
  echo "下一步:"
  echo "  1. 检查变更: git diff --cached"
  echo "  2. 运行检查: npm run check"
  echo "  3. 提交合并: git commit -m 'merge upstream/main'"
else
  echo "⚠️  合并有冲突"
  echo ""
  echo "=== 冲突报告 ==="
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  echo "$CONFLICTS"
  echo ""
  echo "冲突文件数: $(echo "$CONFLICTS" | wc -l)"
  echo ""

  # 检查哪些冲突文件在 CUSTOMIZATION_MANIFEST 中
  echo "=== 定制文件冲突 ==="
  while IFS= read -r file; do
    if grep -q "$file" "$MANIFEST" 2>/dev/null; then
      echo "  [定制] $file"
    else
      echo "  [上游] $file"
    fi
  done <<< "$CONFLICTS"

  echo ""
  echo "=== 建议 ==="
  echo "1. 用 AI 解决冲突（参考 $MERGE_PROMPT）"
  echo "2. 或手动解决后运行: npm run check"
  echo "3. 放弃合并: git merge --abort"
fi
