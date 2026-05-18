// YAML Frontmatter 解析器
// 提取 --- 之间的键值对元数据

import type { DocumentMeta } from "./ast.js";

export interface ParseFrontmatterResult {
  meta: DocumentMeta;
  body: string;
}

/**
 * 解析 .wyw 文件的 frontmatter 部分
 */
export function parseFrontmatter(source: string): ParseFrontmatterResult {
  const defaultMeta: DocumentMeta = {
    title: "",
    author: "",
    dynasty: "",
  };

  const trimmed = source.trimStart();

  // 检查是否以 --- 开头
  if (!trimmed.startsWith("---")) {
    return { meta: defaultMeta, body: source };
  }

  // 按行查找结束的 ---（与校验器行为一致，允许前导空白）
  const lines = trimmed.split("\n");
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) {
    return { meta: defaultMeta, body: source };
  }

  const yamlBlock = lines.slice(1, endLine).join("\n").trim();
  const body = lines
    .slice(endLine + 1)
    .join("\n")
    .trim();

  // 简单的 YAML 键值解析（不支持嵌套）
  const meta: DocumentMeta = { ...defaultMeta };
  for (const line of yamlBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key === "title") {
      meta.title = value;
    }
    if (key === "author") {
      meta.author = value;
    }
    if (key === "dynasty") {
      meta.dynasty = value;
    }
  }

  return { meta, body };
}
