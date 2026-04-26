// wenyanwen 公共 API

import { parse } from "./parser/block-parser.js";
import { renderBody } from "./renderer/html-renderer.js";
import { renderPage } from "./renderer/page-template.js";

export interface CompileOptions {
  inline?: boolean;
  assetsPath?: string;
  theme?: string;
  showTranslation?: boolean;
}

/**
 * 编译 .wyw 源文本为完整 HTML 页面
 */
export function compile(source: string, options: CompileOptions = {}): string {
  const doc = parse(source);
  const body = renderBody(doc);
  return renderPage({
    meta: doc.meta,
    body,
    inline: options.inline || false,
    assetsPath: options.assetsPath || "",
    theme: options.theme || "auto",
    showTranslation: options.showTranslation !== false,
  });
}

export { parse } from "./parser/block-parser.js";
export { renderBody } from "./renderer/html-renderer.js";
export { renderPage } from "./renderer/page-template.js";
export type { RenderPageOptions } from "./renderer/page-template.js";
export type {
  DocumentMeta,
  DocumentNode,
  BlockNode,
  RawBlockNode,
  InlineNode,
  TextNode,
  RubyNode,
  AnnotateNode,
  EmphasisNode,
  RubyAnnotateNode,
  RubyItem,
  HeadingNode,
  ParagraphNode,
  TranslationNode,
  ParagraphGroupNode,
  PoetryBlockNode,
  PoetryHeading,
  PoetryLine,
  BlockquoteNode,
  SectionBreakNode,
  ProofreadDateNode,
} from "./parser/ast.js";
