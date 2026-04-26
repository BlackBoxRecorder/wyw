// AST 节点类型定义与工厂函数

// === 类型定义 ===

export interface DocumentMeta {
  title: string;
  author: string;
  dynasty: string;
}

// Inline 节点

export interface TextNode {
  type: "text";
  value: string;
}

export interface RubyNode {
  type: "ruby";
  base: string;
  annotation: string;
}

export interface AnnotateNode {
  type: "annotate";
  text: string;
  note: string;
}

export interface EmphasisNode {
  type: "emphasis";
  children: InlineNode[];
}

export interface RubyItem {
  base: string;
  annotation: string | null;
}

export interface RubyAnnotateNode {
  type: "ruby_annotate";
  items: RubyItem[];
  note: string;
}

export type InlineNode =
  | TextNode
  | RubyNode
  | AnnotateNode
  | EmphasisNode
  | RubyAnnotateNode;

// Block 节点

export interface DocumentNode {
  type: "document";
  meta: DocumentMeta;
  children: BlockNode[];
}

export interface HeadingNode {
  type: "heading";
  level: number;
  children: InlineNode[];
}

export interface ParagraphNode {
  type: "paragraph";
  children: InlineNode[];
}

export interface TranslationNode {
  type: "translation";
  children: InlineNode[];
}

export interface ParagraphGroupNode {
  type: "paragraph_group";
  paragraph: ParagraphNode | null;
  translation: TranslationNode | null;
}

export interface PoetryHeading {
  type: "heading";
  level: number;
  content: InlineNode[];
}

export type PoetryLine = InlineNode[] | PoetryHeading;

export interface PoetryBlockNode {
  type: "poetry_block";
  title: InlineNode[] | null;
  meta: string | null;
  lines: PoetryLine[];
}

export interface BlockquoteNode {
  type: "blockquote";
  children: InlineNode[];
}

export interface SectionBreakNode {
  type: "section_break";
}

export interface ProofreadDateNode {
  type: "proofread_date";
  date: string;
}

export type BlockNode =
  | HeadingNode
  | ParagraphGroupNode
  | PoetryBlockNode
  | BlockquoteNode
  | SectionBreakNode
  | ProofreadDateNode;

// parseBlocks 返回的原始节点（groupParagraphs 之前）
export type RawBlockNode =
  | ParagraphNode
  | TranslationNode
  | HeadingNode
  | PoetryBlockNode
  | BlockquoteNode
  | SectionBreakNode
  | ProofreadDateNode;

// === Block 节点工厂函数 ===

export function createDocument(
  meta: DocumentMeta,
  children: BlockNode[],
): DocumentNode {
  return { type: "document", meta, children };
}

export function createHeading(
  level: number,
  children: InlineNode[],
): HeadingNode {
  return { type: "heading", level, children };
}

export function createParagraph(children: InlineNode[]): ParagraphNode {
  return { type: "paragraph", children };
}

export function createTranslation(children: InlineNode[]): TranslationNode {
  return { type: "translation", children };
}

export function createParagraphGroup(
  paragraph: ParagraphNode | null,
  translation: TranslationNode | null,
): ParagraphGroupNode {
  return {
    type: "paragraph_group",
    paragraph,
    translation: translation || null,
  };
}

export function createPoetryBlock(
  title: InlineNode[] | null,
  meta: string | null,
  lines: PoetryLine[],
): PoetryBlockNode {
  return {
    type: "poetry_block",
    title: title || null,
    meta: meta || null,
    lines,
  };
}

export function createBlockquote(children: InlineNode[]): BlockquoteNode {
  return { type: "blockquote", children };
}

export function createSectionBreak(): SectionBreakNode {
  return { type: "section_break" };
}

export function createProofreadDate(date: string): ProofreadDateNode {
  return { type: "proofread_date", date };
}

// === Inline 节点工厂函数 ===

export function createText(value: string): TextNode {
  return { type: "text", value };
}

export function createRuby(base: string, annotation: string): RubyNode {
  return { type: "ruby", base, annotation };
}

export function createAnnotate(text: string, note: string): AnnotateNode {
  return { type: "annotate", text, note };
}

export function createEmphasis(children: InlineNode[]): EmphasisNode {
  return { type: "emphasis", children };
}

export function createRubyAnnotate(
  items: RubyItem[],
  note: string,
): RubyAnnotateNode {
  return {
    type: "ruby_annotate",
    items,
    note,
  };
}
