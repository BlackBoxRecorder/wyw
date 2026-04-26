// 内联语法解析器
// 从左到右扫描文本，按优先级匹配内联标记

import {
  createText,
  createRuby,
  createAnnotate,
  createEmphasis,
  createRubyAnnotate,
} from "./ast.js";
import type { InlineNode, RubyItem } from "./ast.js";

interface InlinePattern {
  regex: RegExp;
  create: (
    match: RegExpMatchArray,
    parseInlineFn: (text: string) => InlineNode[],
  ) => InlineNode;
}

// 内联语法的正则模式（按匹配优先级排列）
const PATTERNS: InlinePattern[] = [
  // 注音+注释组合: [{字|拼音}{字}...](释义)
  {
    regex: /\[((?:\{[^}]+\})+)\]\(([^)]+)\)/,
    create: (match) => {
      const items = parseRubyBlocks(match[1]);
      return createRubyAnnotate(items, match[2]);
    },
  },
  // 注音: {字|pīn}
  {
    regex: /\{([^|{}]+)\|([^}]+)\}/,
    create: (match) => createRuby(match[1], match[2]),
  },
  // 注释: [词](释义)
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/,
    create: (match) => createAnnotate(match[1], match[2]),
  },
  // 着重: *文本*（不匹配两侧的 *，要求内容非空）
  {
    regex: /\*([^*]+)\*/,
    create: (match, parseInlineFn) => createEmphasis(parseInlineFn(match[1])),
  },
];

/**
 * 解析大括号块序列，如 "{穹|qióng}{庐}" -> [{base:'穹', annotation:'qióng'}, {base:'庐', annotation:null}]
 */
function parseRubyBlocks(str: string): RubyItem[] {
  const items: RubyItem[] = [];
  for (const m of str.matchAll(/\{([^|{}]+)(?:\|([^}]+))?\}/g)) {
    items.push({ base: m[1], annotation: m[2] || null });
  }
  return items;
}

/**
 * 解析一段文本中的内联标记
 */
export function parseInline(text: string): InlineNode[] {
  // 空输入直接返回空数组
  if (!text) return [];

  const nodes: InlineNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliest: RegExpMatchArray | null = null;
    let earliestIndex = Infinity;
    let earliestPattern: InlinePattern | null = null;

    for (const pattern of PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (match && match.index! < earliestIndex) {
        earliest = match;
        earliestIndex = match.index!;
        earliestPattern = pattern;
      }
    }

    if (!earliest || !earliestPattern) {
      nodes.push(createText(remaining));
      break;
    }

    if (earliestIndex > 0) {
      nodes.push(createText(remaining.slice(0, earliestIndex)));
    }

    nodes.push(earliestPattern.create(earliest, parseInline));

    remaining = remaining.slice(earliestIndex + earliest[0].length);
  }

  return nodes;
}
