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

// ---- 规则 2: 括号匹配检查（栈式结构检测） ----
function checkBracketBalance(lines: string[], v: Validator) {
  const PAIRS: Record<string, string> = { "}": "{", "]": "[", ")": "(" };
  const OPEN = new Set(["{", "[", "("]);
  const CLOSE = new Set(["}", "]", ")"]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stack: Array<{ char: string; col: number }> = [];
    let stars = 0;

    for (let col = 0; col < line.length; col++) {
      const ch = line[col];

      if (OPEN.has(ch)) {
        stack.push({ char: ch, col });
      } else if (CLOSE.has(ch)) {
        const expected = PAIRS[ch];
        if (stack.length === 0) {
          v.error(
            i + 1,
            `第${col + 1}列: 多余的闭合括号 '${ch}'（无对应开括号）`,
          );
        } else {
          const top = stack[stack.length - 1];
          if (top.char !== expected) {
            const expectedClose =
              top.char === "{" ? "}" : top.char === "[" ? "]" : ")";
            v.error(
              i + 1,
              `第${col + 1}列: 括号交叉嵌套，'${ch}' 应出现在 '${expectedClose}' 之前（与第${top.col + 1}列的 '${top.char}' 不匹配）`,
            );
          }
          stack.pop();
        }
      }

      if (ch === "*") stars++;
    }

    // 报告未闭合的开括号
    for (const item of stack) {
      const expectedClose =
        item.char === "{" ? "}" : item.char === "[" ? "]" : ")";
      v.error(
        i + 1,
        `第${item.col + 1}列: '${item.char}' 未闭合，缺少 '${expectedClose}'`,
      );
    }

    if (stars % 2 !== 0) {
      v.warn(i + 1, `着重标记 '*' 未成对（${stars}个）`);
    }
  }
}

// ---- 规则 3: 模式感知语法校验 ----
// 按 inline-parser 优先级顺序提取三种语法模式并逐项校验

interface SyntaxPattern {
  type: "ruby" | "annotate" | "ruby_annotate";
  fullMatch: string;
  line: number;
  col: number;
  base?: string;
  pinyin?: string;
  text?: string;
  note?: string;
  innerBlocks?: string; // ruby_annotate 内层 {...} 序列
}

// 注音校验: {字|拼音}
function validateRubyPattern(p: SyntaxPattern, v: Validator) {
  const base = p.base!;
  const pinyin = p.pinyin!;

  // base 不能为空
  if (!base.trim()) {
    v.error(p.line, `注音标记汉字为空: ${p.fullMatch}`);
    return;
  }

  // base 应为单字
  if (base.length > 1) {
    if (v.strict) {
      v.error(p.line, `注音标记多字: ${p.fullMatch}（必须单字分别标注）`);
    } else {
      v.warn(p.line, `注音标记疑似多字: ${p.fullMatch}（建议单字分别标注）`);
    }
  }

  // pinyin 不能为空
  if (!pinyin.trim()) {
    v.error(p.line, `注音拼音为空: ${p.fullMatch}`);
    return;
  }

  // pinyin 不能含数字
  if (/[0-9]/.test(pinyin)) {
    v.warn(
      p.line,
      `拼音包含数字: "${pinyin}"（建议使用 Unicode 声调符号，如 ā é ě è）`,
    );
  }

  // pinyin 不能含大括号
  if (/[{}]/.test(pinyin)) {
    v.error(p.line, `拼音包含非法字符 '{' 或 '}': ${p.fullMatch}`);
  }
}

// 注释校验: [文本](释义)
function validateAnnotatePattern(p: SyntaxPattern, v: Validator) {
  const text = p.text!;
  const note = p.note!;

  // text 不能为空
  if (!text.trim()) {
    v.error(p.line, `注释词条为空: ${p.fullMatch}`);
  }

  // 释义不能为空（警告）
  if (!note.trim()) {
    v.warn(p.line, `注释释义为空: ${p.fullMatch}`);
  }
}

// 注音+注释组合校验: [{字|拼音}{字}...](释义)
function validateRubyAnnotatePattern(p: SyntaxPattern, v: Validator) {
  const inner = p.innerBlocks!;
  const note = p.note!;

  // 校验内部每个 {字|拼音} 块
  const rubyItemRegex = /\{([^|{}]+)(?:\|([^}]+))?\}/g;
  let itemCount = 0;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = rubyItemRegex.exec(inner)) !== null) {
    itemCount++;
    const rBase = itemMatch[1];
    const rPinyin = itemMatch[2] || "";

    if (!rBase.trim()) {
      v.error(
        p.line,
        `注音+注释组合中注音汉字为空: ${itemMatch[0]}（位于 ${p.fullMatch}）`,
      );
    } else if (rBase.length > 1) {
      if (v.strict) {
        v.error(
          p.line,
          `注音+注释组合中注音多字: ${itemMatch[0]}（位于 ${p.fullMatch}）`,
        );
      } else {
        v.warn(
          p.line,
          `注音+注释组合中注音疑似多字: ${itemMatch[0]}（位于 ${p.fullMatch}）`,
        );
      }
    }

    if (rPinyin) {
      if (/[0-9]/.test(rPinyin)) {
        v.warn(p.line, `拼音包含数字: "${rPinyin}"（位于 ${p.fullMatch}）`);
      }
      if (/[{}]/.test(rPinyin)) {
        v.error(
          p.line,
          `拼音包含非法字符: ${itemMatch[0]}（位于 ${p.fullMatch}）`,
        );
      }
    }
  }

  if (itemCount === 0) {
    v.error(p.line, `注音+注释组合内无有效注音块: ${p.fullMatch}`);
  }

  // 释义不能为空
  if (!note.trim()) {
    v.warn(p.line, `注音+注释组合释义为空: ${p.fullMatch}`);
  }
}

// 模式感知提取与校验（替代原 checkRubyFormat + checkAnnotateFormat）
function extractAndValidatePatterns(lines: string[], v: Validator) {
  // 正则（与 inline-parser 优先级一致）
  const RA_REGEX = /\[((?:\{[^}]+\})+)\]\(([^)]*)\)/g; // ruby_annotate 优先
  const RUBY_REGEX = /\{([^|{}]+)\|([^}]+)\}/g;
  const ANNO_REGEX = /\[([^\]]+)\]\(([^)]*)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const consumed: Array<[number, number]> = [];

    function isConsumed(start: number, end: number): boolean {
      return consumed.some(([s, e]) => start >= s && start < e);
    }

    function markConsumed(start: number, end: number) {
      consumed.push([start, end]);
    }

    // 第1遍: 提取 ruby_annotate（优先级最高）
    let raMatch: RegExpExecArray | null;
    while ((raMatch = RA_REGEX.exec(line)) !== null) {
      if (isConsumed(raMatch.index, raMatch.index + raMatch[0].length))
        continue;
      markConsumed(raMatch.index, raMatch.index + raMatch[0].length);
      validateRubyAnnotatePattern(
        {
          type: "ruby_annotate",
          fullMatch: raMatch[0],
          line: i + 1,
          col: raMatch.index + 1,
          innerBlocks: raMatch[1],
          note: raMatch[2],
        },
        v,
      );
    }

    // 第2遍: 提取 ruby
    let rubyMatch: RegExpExecArray | null;
    while ((rubyMatch = RUBY_REGEX.exec(line)) !== null) {
      if (isConsumed(rubyMatch.index, rubyMatch.index + rubyMatch[0].length))
        continue;
      markConsumed(rubyMatch.index, rubyMatch.index + rubyMatch[0].length);
      validateRubyPattern(
        {
          type: "ruby",
          fullMatch: rubyMatch[0],
          line: i + 1,
          col: rubyMatch.index + 1,
          base: rubyMatch[1],
          pinyin: rubyMatch[2],
        },
        v,
      );
    }

    // 第3遍: 提取 annotate（优先级最低，排除已消费区域）
    let annoMatch: RegExpExecArray | null;
    while ((annoMatch = ANNO_REGEX.exec(line)) !== null) {
      if (isConsumed(annoMatch.index, annoMatch.index + annoMatch[0].length))
        continue;
      const text = annoMatch[1];

      // 如果 text 包含 {..|..} 形式的 ruby 内容，说明应被第2遍匹配但没匹配到，跳过
      if (/\{[^}]+\|[^}]+\}/.test(text)) continue;

      markConsumed(annoMatch.index, annoMatch.index + annoMatch[0].length);
      validateAnnotatePattern(
        {
          type: "annotate",
          fullMatch: annoMatch[0],
          line: i + 1,
          col: annoMatch.index + 1,
          text: annoMatch[1],
          note: annoMatch[2],
        },
        v,
      );
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
  extractAndValidatePatterns(lines, v);
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
