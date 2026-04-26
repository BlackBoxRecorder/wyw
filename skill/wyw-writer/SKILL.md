---
name: wyw-writer
description: Write, edit, and validate .wyw (文言文标记语言) files for classical Chinese texts with ruby annotations, glossaries, translations, and poetry blocks. Use when the user wants to create or edit .wyw files, write classical Chinese markup, add pinyin ruby annotations, compose poetry with annotations, or validate .wyw formatting. Triggers on mentions of .wyw, 文言文, 注音, 诗词标记, 古文排版, wyw格式.
---

# WYW Writer — 文言文标记语言编写与校验

This project implements `.wyw`, a markdown-like markup language for classical Chinese texts. A `.wyw` source file compiles via `wyw build` into a well-typeset HTML page with ruby pinyin, annotations, translations, and poetry layout.

## Quick Start

### Writing a new .wyw file

Use the [examples.md](examples.md) for complete reference when composing .wyw content. The minimal structure is:

```
---
title: 文章标题
author: 作者
dynasty: 朝代
source: 出处
layout: ancient
---

正文内容，{注音|pīn yīn}标注生僻字，[生词](词语释义)添加注释。

>> 现代汉语翻译文本
```

### Compiling

```bash
# Compile a single .wyw file into HTML
node bin/wyw.js build path/to/file.wyw

# Compile with inline CSS/JS (self-contained HTML)
node bin/wyw.js build path/to/file.wyw --inline

# Watch mode
node bin/wyw.js build path/to/file.wyw --watch
```

### Validating

Always validate after writing or editing .wyw content:

```bash
node skill/wyw-writer/scripts/validate.js path/to/file.wyw
```

The validator checks:
- Frontmatter completeness (title, author, dynasty)
- Bracket matching (unclosed `{`, `[`, `(`, `*`)
- Ruby annotation format correctness
- Poetry block structure
- Translation-pair consistency

## Writing Workflow

1. **Determine content type**: prose (paragraph + translation) or poetry (`::: poetry`)
2. **Write frontmatter**: always include `title`, `author`, `dynasty` at minimum
3. **Write body**: use the syntax patterns below
4. **Validate**: run `validate.js` after every edit
5. **Compile and preview**: run `wyw build` and open the HTML

## Syntax Reference

### Frontmatter (required)

```
---
title: 文章标题
author: 作者
dynasty: 朝代
source: 出处
layout: ancient
---
```

Supported fields: `title`, `author`, `dynasty`, `source`, `layout` (default: `ancient`).

### Block-Level Markup

| Syntax | Purpose | Example |
|--------|---------|---------|
| `#` `##` `###` | Headings (1-3 levels) | `# 一级标题` |
| `>>` | Modern Chinese translation | `>> 山不在于高...` |
| `>` | Blockquote | `> 孔子曰：...` |
| `---` | Section break / thematic break | `---` |
| `::: poetry ... :::` | Poetry fenced block | See below |
| `--YYYY 年 M 月 D 日--` | Proofread date | `--2024 年 1 月 15 日--` |

**Poetry block structure:**
```
::: poetry
# 诗词标题
:: [朝代]作者

诗词行一，
诗词行二。
:::
```

Inside poetry blocks:
- `# 标题` (first heading) → poem title
- `##` or `###` headings → sub-section titles (e.g., 其一/其二)
- `:: 元信息` → author/dynasty metadata

### Inline Markup (priority order)

| Priority | Syntax | Output | Example |
|----------|--------|--------|---------|
| 1 | `[{字\|拼音}{字}...](释义)` | Ruby + annotation (multi-char) | `[{箬\|ruò}{笠}](斗笠)` |
| 2 | `{字\|拼音}` | Ruby pinyin annotation | `{仙\|xiān}` |
| 3 | `[词](释义)` | Annotation tooltip | `[陋室](简陋的屋子)` |
| 4 | `*文本*` | Emphasis (italic) | `*孔子*` |

**CRITICAL rules:**
- Ruby `{字|拼音}`: base character first, then `|`, then pinyin. Pinyin uses lowercase with tone marks.
- Annotation `[词](释义)`: annotated text in `[]`, definition in `()`.
- Ruby+annotation combo `[{字|拼音}](释义)`: for single characters that need both ruby and annotation.
- Multi-char ruby+annotation `[{字1|pīn}{字2}...](释义)`: each character in its own `{}`, only those needing ruby get `|拼音`. The annotation in `()` applies to the entire group.
- Nesting: `*emphasis*` can contain other inline markup (recursive parsing).
- No escaping of special characters (`{`, `}`, `[`, `]`, `*`, `|`). Avoid using them as literal text.

### Paragraph + Translation Pairing

Each prose paragraph should have a corresponding `>>` translation immediately after:

```
文言文段落内容。

>> 现代汉语译文。
```

Paragraphs are auto-grouped: a `>>` block pairs with the preceding paragraph. Blank lines separate paragraph groups.

## Common Mistakes to Avoid

1. **Missing frontmatter closing `---`**: The separate `---` at start of frontmatter must have a matching `---` on its own line
2. **`{字|拼音}` with pinyin containing `}`**: Pinyin must not contain `}` or `{` — these break parsing
3. **Unclosed brackets**: Every `{` needs `}`, every `[` needs `]`, every `(` needs `)`
4. **`*` emphasis crossing line boundaries**: Emphasis `*text*` must be on a single line; it doesn't span multiple lines
5. **Poetry block missing closing `:::`**: Must have matching `:::` at end
6. **Translation `>>` not paired with preceding paragraph**: Ensure paragraphs have translations right after them, separated by a blank line before the `>>`
7. **Ruby+annotation `[{}](x)` must have all `{}` inside `[]`**: `[{字1|pīn}{字2}](释义)` is correct; `{字1|pīn}[{字2}](释义)` is wrong
8. **Section break `---` vs frontmatter**: `---` in body text (not at line start of file) is a section break, not frontmatter

## Validation Checklist

When writing or editing, manually check:
- [ ] Frontmatter has `title`, `author`, `dynasty`
- [ ] All `{` have matching `}`
- [ ] All `[` have matching `]`
- [ ] All `(` have matching `)`
- [ ] All `*text*` pairs are complete
- [ ] `::: poetry` has matching `:::`
- [ ] Each prose paragraph has a `>>` translation (if translations intended)
- [ ] Pinyin uses standard lowercase letters with tone marks (āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ)

## Additional Resources

- For the complete syntax guide, see [reference.md](reference.md)
- For annotated writing examples, see [examples.md](examples.md)
- Validator script: [scripts/validate.js](scripts/validate.js)
