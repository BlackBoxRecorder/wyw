// .wyw 文件格式验证器

import { parse } from "./parser/block-parser.js";

export interface ValidationIssue {
  line: number;
  msg: string;
}

export interface ValidationResult {
  filePath?: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats?: {
    paragraphGroups: number;
    poetryBlocks: number;
    headings: number;
    annotations: number;
    rubies: number;
  };
}

export class Validator {
  errors: ValidationIssue[] = [];
  warnings: ValidationIssue[] = [];
  strict: boolean;

  constructor(strict = false) {
    this.strict = strict;
  }

  error(line: number, msg: string) {
    this.errors.push({ line, msg });
  }

  warn(line: number, msg: string) {
    if (this.strict) {
      this.errors.push({ line, msg });
    } else {
      this.warnings.push({ line, msg });
    }
  }
}

// ---- 规则 1: Frontmatter 完整性 ----
function checkFrontmatter(lines: string[], v: Validator) {
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    v.error(1, "文件为空");
    return null;
  }

  const firstLine = lines[0].trim();

  if (!firstLine.startsWith("---")) {
    v.warn(1, "缺少 Frontmatter（建议添加 title、author、dynasty 元数据）");
    return null;
  }

  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endLine = i;
      break;
    }
  }

  if (endLine === -1) {
    v.error(1, "Frontmatter 未闭合：缺少结束的 '---'");
    return null;
  }

  const fmLines = lines.slice(1, endLine);
  const fields: Record<string, string> = {};
  for (const line of fmLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value) {
      fields[key] = value;
    }
  }

  if (!fields.title) {
    v.warn(1, "Frontmatter 缺少 'title' 字段");
  }
  if (!fields.author) {
    v.warn(1, "Frontmatter 缺少 'author' 字段");
  }
  if (!fields.dynasty) {
    v.warn(1, "Frontmatter 缺少 'dynasty' 字段");
  }

  const KNOWN = ["title", "author", "dynasty", "source", "layout"];
  for (const key of Object.keys(fields)) {
    if (!KNOWN.includes(key)) {
      v.warn(endLine + 1, `Frontmatter 未知字段: '${key}'`);
    }
  }

  return { endLine, fields };
}

// ---- 规则 2: 括号匹配检查 ----
function checkBracketBalance(lines: string[], v: Validator) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let lBrace = 0,
      rBrace = 0;
    let lBrack = 0,
      rBrack = 0;
    let lParen = 0,
      rParen = 0;
    let stars = 0;

    for (const ch of line) {
      if (ch === "{") lBrace++;
      if (ch === "}") rBrace++;
      if (ch === "[") lBrack++;
      if (ch === "]") rBrack++;
      if (ch === "(") lParen++;
      if (ch === ")") rParen++;
      if (ch === "*") stars++;
    }

    if (lBrace !== rBrace) {
      v.error(i + 1, `大括号不匹配: {${lBrace}个 vs }${rBrace}个`);
    }
    if (lBrack !== rBrack) {
      v.warn(i + 1, `方括号不匹配: [${lBrack}个 vs ]${rBrack}个`);
    }
    if (lParen !== rParen) {
      v.warn(i + 1, `圆括号不匹配: (${lParen}个 vs )${rParen}个`);
    }
    if (stars % 2 !== 0) {
      v.warn(i + 1, `着重标记 '*' 未成对（${stars}个）`);
    }
  }
}

// ---- 规则 3: 注音格式检查 ----
function checkRubyFormat(lines: string[], v: Validator) {
  const rubyRegex = /\{([^|{}]+)\|([^}]+)\}/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    while ((match = rubyRegex.exec(line)) !== null) {
      const base = match[1];
      const pinyin = match[2];

      if (!base.trim()) {
        v.error(i + 1, `注音标记汉字为空: ${match[0]}`);
      }

      if (!pinyin.trim()) {
        v.error(i + 1, `注音拼音为空: ${match[0]}`);
      }

      if (base.length > 1 && !v.strict) {
        v.warn(i + 1, `注音标记疑似多字: ${match[0]}（建议单字分别标注）`);
      }

      if (/[0-9]/.test(pinyin)) {
        v.warn(i + 1, `拼音包含数字: "${pinyin}"（建议使用 Unicode 声调符号）`);
      }

      if (/[{}]/.test(pinyin)) {
        v.error(i + 1, `拼音包含非法字符 '{' 或 '}': ${match[0]}`);
      }
    }
  }
}

// ---- 规则 4: 注释格式检查 ----
function checkAnnotateFormat(lines: string[], v: Validator) {
  const annotateRegex = /\[([^\]]+)\]\(([^)]*)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    while ((match = annotateRegex.exec(line)) !== null) {
      const text = match[1];
      const note = match[2];

      if (text.includes("{") && text.includes("|") && !text.startsWith("{")) {
        continue;
      }

      if (!text.trim()) {
        v.error(i + 1, `注释词条为空: ${match[0]}`);
      }

      if (!note.trim()) {
        v.warn(i + 1, `注释释义为空: ${match[0]}`);
      }
    }
  }
}

// ---- 规则 5: 诗词围栏块结构检查 ----
function checkFencedBlocks(lines: string[], v: Validator) {
  let openCount = 0;
  let closeCount = 0;
  let inFenced = false;
  let fencedStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith(":::") && trimmed !== "::") {
      if (!inFenced) {
        inFenced = true;
        openCount++;
        fencedStartLine = i + 1;

        const type = trimmed.slice(3).trim();
        if (type && type !== "poetry") {
          v.warn(i + 1, `围栏块类型为 '${type}'（目前仅支持 'poetry'）`);
        }
      } else {
        inFenced = false;
        closeCount++;
      }
    }

    if (inFenced && trimmed.startsWith("::") && !trimmed.startsWith(":::")) {
      const meta = trimmed.slice(2).trim();
      if (!meta) {
        v.warn(i + 1, "围栏内元信息为空（:: 后应有作者/朝代信息）");
      }
    }
  }

  if (openCount !== closeCount) {
    v.error(
      fencedStartLine,
      `诗词围栏块未闭合：${openCount} 个开始， ${closeCount} 个结束`,
    );
  }
}

// ---- 规则 6: 译文配对检查 ----
function checkTranslationPairing(lines: string[], v: Validator) {
  let lastWasParagraph = false;
  let inFenced = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (i === 0 && trimmed.startsWith("---")) {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && trimmed === "---") {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    if (trimmed === ":::") {
      inFenced = !inFenced;
      continue;
    }
    if (inFenced) continue;
    if (trimmed === "") continue;
    if (/^#{1,3}\s/.test(trimmed)) continue;
    if (/^-{3,}$/.test(trimmed)) continue;
    if (trimmed.startsWith(">") && !trimmed.startsWith(">>")) continue;

    if (trimmed.startsWith(">>")) {
      if (!lastWasParagraph) {
        v.warn(i + 1, "译文前缺少对应的文言文段落");
      }
      lastWasParagraph = false;
    } else {
      lastWasParagraph = true;
    }
  }
}

// ---- 规则 7: 项目解析器深度校验 ----
function checkWithParser(
  source: string,
  v: Validator,
): ValidationResult["stats"] {
  try {
    const doc = parse(source);

    let paragraphGroups = 0,
      poetryBlocks = 0,
      headings = 0;

    function countNodes(nodeOrArray: unknown) {
      if (Array.isArray(nodeOrArray)) {
        for (const n of nodeOrArray) countNodes(n);
        return;
      }
      if (!nodeOrArray || typeof nodeOrArray !== "object") return;
      const node = nodeOrArray as Record<string, unknown>;
      if (node.type === "paragraph_group") paragraphGroups++;
      if (node.type === "poetry_block") poetryBlocks++;
      if (node.type === "heading") headings++;
      if (node.children) countNodes(node.children);
      if (node.lines) countNodes(node.lines);
    }

    countNodes(doc.children);

    const annotations = (source.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    const rubies = (source.match(/\{[^|{}]+\|[^}]+\}/g) || []).length;

    return { paragraphGroups, poetryBlocks, headings, annotations, rubies };
  } catch (err) {
    v.error(0, `解析器校验失败: ${(err as Error).message}`);
    return undefined;
  }
}

// ---- 入口函数 ----
export function validate(
  source: string,
  options: { strict?: boolean; filePath?: string } = {},
): ValidationResult {
  const v = new Validator(options.strict ?? false);
  const lines = source.split("\n");

  checkFrontmatter(lines, v);
  checkBracketBalance(lines, v);
  checkRubyFormat(lines, v);
  checkAnnotateFormat(lines, v);
  checkFencedBlocks(lines, v);
  checkTranslationPairing(lines, v);
  const stats = checkWithParser(source, v);

  return {
    filePath: options.filePath,
    errors: v.errors,
    warnings: v.warnings,
    stats,
  };
}

// ---- 格式化验证结果输出 ----
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`\n校验文件: ${result.filePath || "<unknown>"}`);
  lines.push(
    `  错误: ${result.errors.length}  提示: ${result.warnings.length}`,
  );

  if (result.errors.length > 0) {
    lines.push("\n错误:");
    for (const e of result.errors) {
      lines.push(`  第 ${e.line} 行: ${e.msg}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\n提示:");
    for (const w of result.warnings) {
      lines.push(`  第 ${w.line} 行: ${w.msg}`);
    }
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push("  格式校验通过");
  } else if (result.errors.length === 0) {
    lines.push("  无严重错误（用 --strict 将所有提示升级为错误）");
  }

  if (result.stats) {
    const s = result.stats;
    lines.push(
      `\n  解析统计: ${s.paragraphGroups} 段落组, ${s.poetryBlocks} 诗词块, ${s.headings} 标题`,
    );
    lines.push(`  标注统计: ${s.annotations} 注释, ${s.rubies} 注音`);
  }

  lines.push("");
  return lines.join("\n");
}
