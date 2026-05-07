/**
 * .wyw 文件格式验证器
 *
 * 负责对 .wyw（文言文标记语言）文件进行多维度格式校验，包括：
 *   1. Frontmatter 完整性（元数据字段检查）
 *   2. 括号匹配（栈式结构检测，含成对大括号 {}、方括号 []、圆括号 ()）
 *   3. 模式感知语法校验（注音 {字|拼音}、注释 [文本](释义)、注音+注释组合）
 *   4. 注音后紧随括号检测（{字|拼音}(...) 遗漏方括号的格式）
 *   5. 诗词围栏块结构（:::poetry 起止配对）
 *   6. 译文配对（>> 译文行前必须有原文段落）
 *   7. 解析器深度校验（利用 block-parser 做 AST 级统计）
 *
 * 提供两种使用方式：
 *   - 编程接口：调用 validate() 获取 ValidationResult
 *   - 格式化输出：调用 formatValidationResult() 生成可读文本
 */

import { parse } from "./parser/block-parser.js";

/**
 * 单条校验问题描述
 */
export interface ValidationIssue {
  /** 行号（从 1 开始；0 表示全局级错误，如解析器崩溃） */
  line: number;
  /** 问题描述信息 */
  msg: string;
}

/**
 * 完整校验结果
 */
export interface ValidationResult {
  /** 被校验的文件路径（可选） */
  filePath?: string;
  /** 错误列表（阻断性问题，必须修复） */
  errors: ValidationIssue[];
  /** 警告列表（建议性问题，在 strict 模式下会升级为错误） */
  warnings: ValidationIssue[];
  /** 文件统计信息（仅在解析器校验成功时返回） */
  stats?: {
    /** 段落组数量 */
    paragraphGroups: number;
    /** 诗词块数量 */
    poetryBlocks: number;
    /** 标题数量 */
    headings: number;
    /** 注释 `[...](...)` 数量 */
    annotations: number;
    /** 注音 `{x|y}` 数量 */
    rubies: number;
  };
}

/**
 * 校验器实例
 *
 * 封装错误/警告收集逻辑，并提供 strict 模式切换。
 * - 普通模式：错误 + 警告分离，警告不会阻断流程
 * - strict 模式：所有 warn() 调用都提升为 error，用于 CI/预提交等严格场景
 */
export class Validator {
  /** 收集到的错误列表 */
  errors: ValidationIssue[] = [];
  /** 收集到的警告列表（strict 模式下为空，全部进入 errors） */
  warnings: ValidationIssue[] = [];
  /** 是否启用严格模式 */
  strict: boolean;

  /**
   * @param strict - 严格模式开关，默认 false
   *   - false: warn() 写入 warnings 列表
   *   - true:  warn() 写入 errors 列表（将所有提示升级为错误）
   */
  constructor(strict = false) {
    this.strict = strict;
  }

  /**
   * 记录一个错误（始终写入 errors）
   * @param line - 行号（从 1 开始）
   * @param msg  - 错误描述
   */
  error(line: number, msg: string) {
    this.errors.push({ line, msg });
  }

  /**
   * 记录一个警告
   *   - 普通模式：写入 warnings
   *   - strict 模式：写入 errors（等同于 error）
   * @param line - 行号（从 1 开始）
   * @param msg  - 警告描述
   */
  warn(line: number, msg: string) {
    if (this.strict) {
      this.errors.push({ line, msg });
    } else {
      this.warnings.push({ line, msg });
    }
  }
}

/**
 * ---- 规则 1: Frontmatter 完整性 ----
 *
 * 校验文件头部 YAML 风格 Frontmatter 区域（`---` 包裹的键值对）：
 *   1. 文件非空
 *   2. 存在开闭 `---` 标记
 *   3. 必填字段 title / author / dynasty 存在
 *   4. 检测未知字段（防止拼写错误）
 *
 * @param lines - 按换行符拆分的源码行数组
 * @param v     - 校验器实例，用于收集错误/警告
 * @returns 如果 Frontmatter 正常闭合，返回 { endLine, fields }；否则返回 null
 */
function checkFrontmatter(lines: string[], v: Validator) {
  // 空文件检测
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    v.error(1, "文件为空");
    return null;
  }

  const firstLine = lines[0].trim();

  // 检查第一行是否以 `---` 开头
  if (!firstLine.startsWith("---")) {
    v.warn(1, "缺少 Frontmatter（建议添加 title、author、dynasty 元数据）");
    return null;
  }

  // 查找结束 `---` 的行号
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endLine = i;
      break;
    }
  }

  // 未找到结束标记则报错
  if (endLine === -1) {
    v.error(1, "Frontmatter 未闭合：缺少结束的 '---'");
    return null;
  }

  // 提取键值对：key: value
  const fmLines = lines.slice(1, endLine);
  const fields: Record<string, string> = {};
  for (const line of fmLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue; // 忽略不含冒号的行
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value) {
      fields[key] = value;
    }
  }

  // 检查必填字段（警告级别）
  if (!fields.title) {
    v.warn(1, "Frontmatter 缺少 'title' 字段");
  }
  if (!fields.author) {
    v.warn(1, "Frontmatter 缺少 'author' 字段");
  }
  if (!fields.dynasty) {
    v.warn(1, "Frontmatter 缺少 'dynasty' 字段");
  }

  // 检查未知字段（白名单方式）
  const KNOWN = ["title", "author", "dynasty"];
  for (const key of Object.keys(fields)) {
    if (!KNOWN.includes(key)) {
      v.warn(endLine + 1, `Frontmatter 未知字段: '${key}'`);
    }
  }

  return { endLine, fields };
}

/**
 * ---- 规则 2: 括号匹配检查（栈式结构检测） ----
 *
 * 使用栈（stack）逐行检测三类括号的配对情况：
 *   - 开括号: {  [  (
 *   - 闭括号: }  ]  )
 *
 * 检测以下问题：
 *   1. 多余的闭合括号（无对应开括号）
 *   2. 括号交叉嵌套（如 `{ [ } ]`）
 *   3. 未闭合的开括号
 *   4. 着重标记 `*` 是否成对出现
 *
 * 注意：此检查在模式感知校验（规则 3）之前执行，能捕捉到
 * 粗粒度的括号结构问题，但不会区分不同类型的语义括号。
 *
 * @param lines - 按换行符拆分的源码行数组
 * @param v     - 校验器实例
 */
function checkBracketBalance(lines: string[], v: Validator) {
  /** 闭括号 → 对应开括号的映射表 */
  const PAIRS: Record<string, string> = { "}": "{", "]": "[", ")": "(" };
  const OPEN = new Set(["{", "[", "("]);
  const CLOSE = new Set(["}", "]", ")"]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stack: Array<{ char: string; col: number }> = [];
    let stars = 0; // 着重标记 '*' 个数，用于检测成对性

    for (let col = 0; col < line.length; col++) {
      const ch = line[col]; // 当前字符

      // 开括号 → 入栈，记录字符和列位置
      if (OPEN.has(ch)) {
        stack.push({ char: ch, col }); // 当前字符是开括号 入栈
      } else if (CLOSE.has(ch)) {
        const expected = PAIRS[ch]; // 当前字符是闭括号，获取对应开括号
        // 情况1: 栈为空 → 多余的闭括号
        if (stack.length === 0) {
          v.error(
            i + 1,
            `第${col + 1}列: 多余的闭合括号 '${ch}'（无对应开括号）`,
          );
        } else {
          const top = stack[stack.length - 1];
          // 情况2: 栈顶符号不匹配 → 交叉嵌套
          if (top.char !== expected) {
            const expectedClose =
              top.char === "{" ? "}" : top.char === "[" ? "]" : ")";
            v.error(
              i + 1,
              `第${col + 1}列: 括号交叉嵌套，'${ch}' 应出现在 '${expectedClose}' 之前（与第${top.col + 1}列的 '${top.char}' 不匹配）`,
            );
          }
          // 匹配成功 → 弹出栈顶
          stack.pop();
        }
      }

      if (ch === "*") stars++;
    }

    // 报告未闭合的开括号（栈中剩余的元素）
    for (const item of stack) {
      const expectedClose =
        item.char === "{" ? "}" : item.char === "[" ? "]" : ")";
      v.error(
        i + 1,
        `第${item.col + 1}列: '${item.char}' 未闭合，缺少 '${expectedClose}'`,
      );
    }

    // 着重标记 `*` 应成对出现
    if (stars % 2 !== 0) {
      v.warn(i + 1, `着重标记 '*' 未成对（${stars}个）`);
    }
  }
}

/**
 * ---- 规则 3: 模式感知语法校验 ----
 *
 * 按 inline-parser 优先级顺序提取三种语法模式并逐项校验。
 * 解析优先级（与渲染端保持一致）：
 *   1. ruby_annotate:  [{字|拼音}...](释义)  — 注音+注释组合，优先匹配
 *   2. ruby:           {字|拼音}              — 单字注音
 *   3. annotate:       [文本](释义)            — 纯注释，优先级最低
 *
 * 每种模式提取后调用对应的 validate*Pattern 函数进行语义校验。
 */

/**
 * 语法模式描述
 *
 * 从源码中提取到一个完整的 WYW 语法标记后，将其拆解为此结构，
 * 便于各校验函数统一处理。
 */
interface SyntaxPattern {
  /** 模式类型 */
  type: "ruby" | "annotate" | "ruby_annotate";
  /** 完整匹配字符串（用于错误消息中定位） */
  fullMatch: string;
  /** 所在行号（1-based） */
  line: number;
  /** 所在列号（1-based） */
  col: number;
  /** ruby 模式：被注音的汉字 */
  base?: string;
  /** ruby 模式：拼音 */
  pinyin?: string;
  /** annotate 模式：被注释的文本 */
  text?: string;
  /** annotate 模式：释义内容 */
  note?: string;
  /** ruby_annotate 模式：内层 {...} 序列（不含外层方括号和圆括号） */
  innerBlocks?: string;
}

/**
 * 校验单个注音模式: {字|拼音}
 *
 * 检查项：
 *   - base（汉字）非空
 *   - base 为单字（strict 模式下多字为错误，否则为警告）
 *   - pinyin（拼音）非空
 *   - pinyin 不含数字（建议使用 Unicode 声调符号）
 *   - pinyin 不含大括号（避免与 WYW 语法冲突）
 */
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

  // pinyin 不能含数字（如 ni3hao3）
  if (/[0-9]/.test(pinyin)) {
    v.warn(
      p.line,
      `拼音包含数字: "${pinyin}"（建议使用 Unicode 声调符号，如 ā é ě è）`,
    );
  }

  // pinyin 不能含大括号（会破坏 WYW 语法解析）
  if (/[{}]/.test(pinyin)) {
    v.error(p.line, `拼音包含非法字符 '{' 或 '}': ${p.fullMatch}`);
  }
}

/**
 * 校验单个注释模式: [文本](释义)
 *
 * 检查项：
 *   - text（被注释文本）非空
 *   - note（释义）非空（警告级别）
 */
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

/**
 * 校验注音+注释组合模式: [{字|拼音}{字}...](释义)
 *
 * 这是最复杂的语法模式，需同时校验：
 *   1. 内部每个 {字|拼音} 块的完整性和正确性
 *   2. 外部释义的非空性
 *
 * 内部块校验逻辑复用 validateRubyPattern 的思路，但上下文不同：
 * 同一组合内的多个 {字} 共享一个释义。
 */
function validateRubyAnnotatePattern(p: SyntaxPattern, v: Validator) {
  const inner = p.innerBlocks!;
  const note = p.note!;

  // 校验内部每个 {字|拼音} 块
  // 正则: 匹配 {base|pinyin} 或 {base}（允许无拼音，此时 base 为纯文本）
  const rubyItemRegex = /\{([^|{}]+)(?:\|([^}]+))?\}/g;
  let itemCount = 0;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = rubyItemRegex.exec(inner)) !== null) {
    itemCount++;
    const rBase = itemMatch[1]; // 捕获组1: 汉字
    const rPinyin = itemMatch[2] || ""; // 捕获组2: 拼音（可选）

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

/**
 * 模式感知提取与校验
 *
 * 这是规则 3 的主函数，按优先级三遍扫描每一行：
 *
 *   第1遍 — ruby_annotate（优先级最高）
 *     正则: `\[((?:\{[^}]+\})+)\]\(([^)]*)\)`
 *     匹配 [{...}{...}](释义) 形式的注音+注释组合
 *
 *   第2遍 — ruby
 *     正则: `\{([^|{}]+)\|([^}]+)\}`
 *     匹配 {字|拼音} 形式的单字注音
 *
 *   第3遍 — annotate（优先级最低）
 *     正则: `\[([^\]]+)\]\(([^)]*)\)`
 *     匹配 [文本](释义) 形式的纯注释
 *     额外过滤：如果文本内含 {..|..} 则跳过（说明应已被 ruby 匹配）
 *
 * 使用 consumed 数组标记已消费区间，避免重复匹配。
 * 这确保了与 inline-parser 完全一致的解析行为。
 *
 * @param lines - 源码行数组
 * @param v     - 校验器实例
 */
function extractAndValidatePatterns(lines: string[], v: Validator) {
  // 正则（与 inline-parser 优先级一致）
  const RA_REGEX = /\[((?:\{[^}]+\})+)\]\(([^)]*)\)/g; // ruby_annotate 优先
  const RUBY_REGEX = /\{([^|{}]+)\|([^}]+)\}/g;
  const ANNO_REGEX = /\[([^\]]+)\]\(([^)]*)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    /**
     * 区间消费表: 记录行内已匹配的 [start, end) 区间
     * 高优先级模式匹配后标记区间，低优先级扫描时跳过
     */
    const consumed: Array<[number, number]> = [];

    /** 判断给定区间是否已被高优先级模式消费 */
    function isConsumed(start: number, end: number): boolean {
      return consumed.some(([s, e]) => start >= s && start < e);
    }

    /** 标记一个区间为已消费 */
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

/**
 * ---- 规则 4: 注音后紧随括号检测 ----
 *
 * 检测 {字|拼音}(...) 格式：注音标记后直接跟圆括号内容，
 * 通常意味着用户遗漏了方括号，正确写法应为 [{字|拼音}](...)。
 *
 * 使用负向后顾 (?<![) 排除已被方括号包裹的正确组合语法。
 * 匹配到后用 warn 报告（strict 模式下升级为 error）。
 *
 * @param lines - 源码行数组
 * @param v     - 校验器实例
 */
function checkRubyBareAnnotation(lines: string[], v: Validator) {
  // 匹配 {字|拼音} 后紧跟 ( 的模式，但排除 [{字|拼音}] 的正确组合语法
  const RUBY_PAREN_REGEX = /(?<!\[)\{([^|{}]+)\|([^}]+)\}\s*\(/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    while ((match = RUBY_PAREN_REGEX.exec(line)) !== null) {
      v.warn(
        i + 1,
        `注音标记后紧跟括号: '{${match[1]}|${match[2]}}…'，可能遗漏了方括号（应为 [{${match[1]}|${match[2]}}](...) 格式）`,
      );
    }
  }
}

/**
 * ---- 规则 5: 诗词围栏块结构检查 ----
 *
 * 检测 `:::poetry` 围栏代码块的起止配对情况：
 *   1. 开闭 `:::` 数量一致（未闭合报错）
 *   2. 围栏内 `::` 元信息行非空（如 `:: 李白·唐`）
 *   3. 围栏类型是否支持（目前仅支持 poetry）
 *
 * 状态机模型：
 *   inFenced = false → 遇到 `:::` → inFenced = true（进入围栏块）
 *   inFenced = true  → 遇到 `:::` → inFenced = false（退出围栏块）
 *
 * @param lines - 源码行数组
 * @param v     - 校验器实例
 */
function checkFencedBlocks(lines: string[], v: Validator) {
  let openCount = 0; // 围栏开始标记数
  let closeCount = 0; // 围栏结束标记数
  let inFenced = false; // 是否处于围栏块内部
  let fencedStartLine = 0; // 最近一个围栏块的起始行号

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 检测围栏边界标记 `:::`
    if (trimmed.startsWith(":::") && trimmed !== "::") {
      if (!inFenced) {
        // 进入围栏块
        inFenced = true;
        openCount++;
        fencedStartLine = i + 1;

        const type = trimmed.slice(3).trim();
        // 检查围栏块类型是否支持
        if (type && type !== "poetry") {
          v.warn(i + 1, `围栏块类型为 '${type}'（目前仅支持 'poetry'）`);
        }
      } else {
        // 退出围栏块
        inFenced = false;
        closeCount++;
      }
    }

    // 围栏块内部：检测 `::` 元信息行（如 `:: 李白·唐`）
    if (inFenced && trimmed.startsWith("::") && !trimmed.startsWith(":::")) {
      const meta = trimmed.slice(2).trim();
      if (!meta) {
        v.warn(i + 1, "围栏内元信息为空（:: 后应有作者/朝代信息）");
      }
    }
  }

  // 最终校验：开闭数量必须一致
  if (openCount !== closeCount) {
    v.error(
      fencedStartLine,
      `诗词围栏块未闭合：${openCount} 个开始， ${closeCount} 个结束`,
    );
  }
}

/**
 * ---- 规则 6: 译文配对检查 ----
 *
 * 在 WYW 格式中，`>>` 开头的行表示文言文的白话译文。
 * 此规则确保：
 *   1. 译文行前有对应的原文段落（`>>` 之前必须有非空、非标记的文本行）
 *   2. 连续两个 `>>` 不会导致误报
 *
 * 状态跟踪：
 *   lastWasParagraph: 上一个有效行是否为原文段落
 *
 * 需要跳过的行类型（不影响 lastWasParagraph 状态）：
 *   - Frontmatter 区域（--- ... ---）
 *   - 围栏块内部（:::poetry ... :::）
 *   - 空行
 *   - 标题（# ## ###）
 *   - 分隔线（---）
 *   - 引用块（> 但非 >>）
 *
 * @param lines - 源码行数组
 * @param v     - 校验器实例
 */
function checkTranslationPairing(lines: string[], v: Validator) {
  let lastWasParagraph = false; // 上一个有效行是否为原文段落
  let inFenced = false; // 是否处于诗词围栏块内
  let inFrontmatter = false; // 是否处于 Frontmatter 区域内

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 跳过 Frontmatter 区域
    if (i === 0 && trimmed.startsWith("---")) {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && trimmed === "---") {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    // 跳过围栏块边界
    if (trimmed === ":::") {
      inFenced = !inFenced;
      continue;
    }
    if (inFenced) continue; // 跳过围栏块内部内容
    if (trimmed === "") continue; // 跳过空行
    if (/^#{1,3}\s/.test(trimmed)) continue; // 跳过标题
    if (/^-{3,}$/.test(trimmed)) continue; // 跳过分隔线
    if (trimmed.startsWith(">") && !trimmed.startsWith(">>")) continue; // 跳过普通引用块

    // 检测译文行 `>>`
    if (trimmed.startsWith(">>")) {
      if (!lastWasParagraph) {
        v.warn(i + 1, "译文前缺少对应的文言文段落");
      }
      lastWasParagraph = false; // 译文行本身不算原文段落
    } else {
      // 其他非标记行 → 视为原文段落
      lastWasParagraph = true;
    }
  }
}

/**
 * ---- 规则 7: 解析器深度校验 ----
 *
 * 将源码送入 block-parser 进行完整 AST 解析，统计结构元素数量。
 * 这是最全面的校验方式——如果前几项规则未发现的问题导致解析失败，
 * 此规则会捕获解析异常并报告。
 *
 * 统计指标使用递归遍历 AST：
 *   - paragraphGroups: 段落组（原文+译文一对一配对组）
 *   - poetryBlocks:    诗词围栏块
 *   - headings:        各级标题（# / ## / ###）
 *
 * 标注统计使用源码级正则匹配（与其他规则独立）：
 *   - annotations: 注释 `[...](...)` 总数
 *   - rubies:       注音 `{x|y}` 总数
 *
 * @param source - 完整源码字符串
 * @param v      - 校验器实例
 * @returns 结构统计数据，解析失败时返回 undefined
 */
function checkWithParser(
  source: string,
  v: Validator,
): ValidationResult["stats"] {
  try {
    const doc = parse(source);

    let paragraphGroups = 0,
      poetryBlocks = 0,
      headings = 0;

    /**
     * 递归遍历 AST 节点统计结构元素
     * 支持的节点结构：
     *   - 扁平 children 数组（大多数 block 节点）
     *   - lines 数组（段落组内部的行节点）
     */
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

    // 源码级统计：粗略匹配注释和注音数量
    const annotations = (source.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    const rubies = (source.match(/\{[^|{}]+\|[^}]+\}/g) || []).length;

    return { paragraphGroups, poetryBlocks, headings, annotations, rubies };
  } catch (err) {
    v.error(0, `解析器校验失败: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * ---- 入口函数 ----
 *
 * 执行 .wyw 文件的全量校验，按顺序运行所有校验规则：
 *   1. checkFrontmatter       — Frontmatter 完整性
 *   2. checkBracketBalance    — 括号匹配
 *   3. extractAndValidatePatterns — 模式感知语法
 *   4. checkRubyBareAnnotation — 注音后紧随括号检测
 *   5. checkFencedBlocks      — 诗词围栏块结构
 *   6. checkTranslationPairing — 译文配对
 *   7. checkWithParser        — 解析器深度校验（同时生成 stats）
 *
 * @param source  - .wyw 文件的完整源码字符串
 * @param options - 可选配置
 *   - strict:   是否启用严格模式（警告升级为错误），默认 false
 *   - filePath: 文件路径（用于输出中标识文件），可选
 * @returns 包含 errors、warnings、stats 的完整校验结果
 */
export function validate(
  source: string,
  options: { strict?: boolean; filePath?: string } = {},
): ValidationResult {
  const v = new Validator(options.strict ?? false);
  const lines = source.split("\n");

  // 按顺序执行各校验规则
  checkFrontmatter(lines, v);
  checkBracketBalance(lines, v);
  extractAndValidatePatterns(lines, v);
  checkRubyBareAnnotation(lines, v);
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

/**
 * 格式化验证结果为可读文本
 *
 * 将 ValidationResult 转换为终端友好的多行文本输出，包含：
 *   1. 文件路径和问题总数摘要
 *   2. 按行号排序的错误列表
 *   3. 按行号排序的警告列表
 *   4. 通过/提示状态
 *   5. 解析统计（段落组、诗词块、标题、注释、注音数量）
 *
 * @param result - validate() 返回的校验结果
 * @returns 格式化后的多行文本字符串
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  // 头部：文件路径和问题摘要
  lines.push(`\n校验文件: ${result.filePath || "<unknown>"}`);
  lines.push(
    `  错误: ${result.errors.length}  提示: ${result.warnings.length}`,
  );

  // 错误列表
  if (result.errors.length > 0) {
    lines.push("\n错误:");
    for (const e of result.errors) {
      lines.push(`  第 ${e.line} 行: ${e.msg}`);
    }
  }

  // 警告列表
  if (result.warnings.length > 0) {
    lines.push("\n提示:");
    for (const w of result.warnings) {
      lines.push(`  第 ${w.line} 行: ${w.msg}`);
    }
  }

  // 结果摘要
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push("  格式校验通过");
  } else if (result.errors.length === 0) {
    lines.push("  无严重错误（用 --strict 将所有提示升级为错误）");
  }

  // 解析统计信息
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
