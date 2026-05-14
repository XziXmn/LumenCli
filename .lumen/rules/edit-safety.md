---
tools: [edit, write]
---
编辑文件时的注意事项：
- read tool 输出的 hashline 前缀（如 `42sr|`）不是文件内容的一部分，不要包含在 old_string 中
- hashline 格式: `行号` + `2字母hash` + `|` + `行内容`（例如 `15ab|function hello() {`）
- hash 用于验证行内容未变化，如果 hash 不匹配说明文件已被修改，需要重新 read
- old_string 必须在文件中唯一匹配，如果不唯一请包含更多上下文行
- 修改前确认已经 read 过该文件
- 保持原有缩进风格（tab 或 space）
