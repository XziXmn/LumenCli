import { pathToFiletype } from "@opentui/core";

/**
 * 从文件路径推导 tree-sitter 语言标识。直接复用 OpenTUI 内置的 `pathToFiletype`
 * (`lib/tree-sitter/resolve-ft.ts`)，覆盖完整的扩展名/basename 映射。
 *
 * 未识别时返回 `"none"`，对应 OpenTUI `<code>` 元素禁用语法高亮但保留文本渲染。
 */
export function filetypeFromPath(filePath: string | undefined): string {
	if (!filePath) return "none";
	return pathToFiletype(filePath) ?? "none";
}
