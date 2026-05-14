---
tools: [bash]
keywords: [rm, delete, 删除, drop, truncate]
---
执行危险命令时的注意事项：
- 删除操作前先确认路径正确
- 不要使用 `rm -rf /` 或类似的递归删除根目录命令
- 数据库操作前先备份
- 优先使用 `git stash` 或 snapshot 保存当前状态
