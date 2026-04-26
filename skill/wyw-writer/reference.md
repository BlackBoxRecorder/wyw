# WYW 语法完整参考

本文档为 `.wyw` 文言文标记语言的完整语法参考，按块级语法和内联语法分节详述。

---

## 文件结构

`.wyw` 文件由 Frontmatter 元数据头和正文内容两部分组成。

---

## Frontmatter（元数据）

使用 YAML 格式定义，包裹在 `---` 之间，必须位于文件开头。

```
---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
source: 全唐文
layout: ancient
---
```

### 支持的字段

| 字段 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | 推荐 | `""` | 文章标题 |
| `author` | 推荐 | `""` | 作者姓名 |
| `dynasty` | 推荐 | `""` | 所属朝代 |
| `source` | 可选 | `""` | 出处来源 |
| `layout` | 可选 | `"ancient"` | 布局样式 |

### 解析规则

- 文件必须以 `---` 开头才识别为 frontmatter
- 结束标记 `\n---` 必须存在（一个 `---` 独占一行）
- 未闭合的 `---` 会导致整个文件被视为正文
- YAML 解析是简单的 `key: value` 格式，不支持嵌套

---

## 块级语法

### 行匹配优先级

解析器使用有限状态机逐行扫描，在 IDLE 状态下按以下优先级匹配：

| 优先级 | 行首标记 | 节点类型 | 说明 |
|--------|----------|----------|------|
| 1 | `---`（3+连字符） | `section_break` | 分隔线 |
| 2 | `--YYYY 年 M 月 D 日--` | `proofread_date` | 校对日期 |
| 3 | `#` / `##` / `###` | `heading` | 标题 1-3 级 |
| 4 | `:::` | `poetry_block` | 围栏块开始 |
| 5 | `>>` | `translation` | 现代文翻译 |
| 6 | `>`（非 `>>`） | `blockquote` | 引用块 |
| 7 | 其他非空行 | `paragraph` | 普通段落 |

### 状态转换图

```
IDLE --普通行--> IN_PARAGRAPH
IDLE -->> 行--> IN_TRANSLATION
IDLE --> 行--> IN_BLOCKQUOTE
IDLE --::: 行--> IN_FENCED

IN_PARAGRAPH --空行--> flush + IDLE
IN_PARAGRAPH -->> 行--> flush段落 + IN_TRANSLATION
IN_PARAGRAPH --普通行--> 继续累积

IN_TRANSLATION -->> 行--> 继续累积
IN_TRANSLATION --其他--> flush译文 + 回退行 + IDLE

IN_FENCED --::: --> flush围栏 + IDLE
IN_FENCED --# 标题(首行)--> 记录围栏标题
IN_FENCED --:: 元信息--> 记录围栏元信息
IN_FENCED --其他--> 累积为诗词行

IN_BLOCKQUOTE --> 行--> 继续累积
IN_BLOCKQUOTE --其他--> flush引用 + 回退行 + IDLE
```

### 1. 标题 (heading)

```
# 一级标题
## 二级标题
### 三级标题
```

- `#` → `<h2>`, `##` → `<h3>`, `###` → `<h4>`（`<h1>` 保留给页面标题）
- 标题内容支持内联语法

### 2. 段落 (paragraph)

- 普通文本行，段落之间用空行分隔
- 段落内换行会合并为一行
- 支持全部内联语法

### 3. 译文 (translation)

```
>> 现代文翻译第一行
>> 现代文翻译第二行
```

- 以 `>> ` 开头
- 自动与紧邻上方段落配对成 `paragraph_group`
- 遇到非 `>>` 行时 translation 结束

### 4. 引用块 (blockquote)

```
> 引用内容
> 多行引用继续
```

### 5. 分隔线 (section_break)

```
---
```

三个或更多连字符独占一行。正文中的 `---` 是分隔线；文件开头的 `---` 是 frontmatter 标记。

### 6. 校对日期 (proofread_date)

```
--2024 年 1 月 15 日--
```

严格匹配 `--\d{4} 年 \d{1,2} 月 \d{1,2} 日--` 格式。

### 7. 诗词围栏块 (poetry_block)

```
::: poetry
# 诗词标题
:: [朝代]作者

诗词正文第一行，
诗词正文第二行。

## 子标题
诗词正文第三行。
:::
```

**围栏内特殊行：**

| 行类型 | 语法 | 说明 |
|--------|------|------|
| 打开围栏 | `::: poetry` 或 `:::` | 默认类型为 `poetry` |
| 标题 | `# 标题` | 首个 `#` 行作为主标题 |
| 子标题 | `## 副标题` / `### 小标题` | 首个标题之后的次级标题 |
| 元信息 | `:: 文本` | 作者/朝代等 |
| 正文 | 普通行 | 每行独立内联解析 |
| 关闭围栏 | `:::` | 结束围栏 |

---

## 内联语法

### 匹配算法

从左到右扫描，取最早出现的匹配（先到先得）：

| 优先级 | 模式 | AST 类型 | HTML |
|--------|------|----------|------|
| 1 | `[{字\|拼音}{字}...](释义)` | `ruby_annotate` | `<ruby><span data-note="...">字<rt>拼音</rt></span></ruby>` |
| 2 | `{字\|拼音}` | `ruby` | `<ruby>字<rt>拼音</rt></ruby>` |
| 3 | `[词](释义)` | `annotate` | `<span class="wyw-annotate" data-note="...">词</span>` |
| 4 | `*文本*` | `emphasis` | `<em>文本</em>` |

### 1. 注音 — `{字|拼音}`

```
有{仙|xiān}则名
```

- 竖线左侧为汉字，右侧为拼音
- 拼音用小写 + Unicode 声调符号
- 拼音中不可含 `{` `}` 字符
- HTML: `<ruby>仙<rp>(</rp><rt>xiān</rt><rp>)</rp></ruby>`

### 2. 注释 — `[词](释义)`

```
[陋室](简陋的屋子)
```

- 方括号内为注释对象，圆括号内为释义
- 释义不可跨行
- HTML: `<span class="wyw-annotate" data-note="简陋的屋子">陋室</span>`

### 3. 注音+注释（单字） — `[{字|拼音}](释义)`

```
春眠不觉[{晓|xiǎo}](天刚亮的时候)
```

- 单字同时需要注音和注释时使用
- HTML: `<ruby><span class="wyw-annotate" data-note="...">晓</span><rt>xiǎo</rt></ruby>`

### 4. 注音+注释（多字） — `[{字|拼音}{字}...](释义)`

```
青[{箬|ruò}{笠}](用箬竹叶或竹篾编成的斗笠)
三男[{邺|yè}{城}{戍|shù}](三个儿子在邺城服役)
```

- 中括号内每个字用 `{}` 包裹
- 需注音的字：`{字|拼音}`，不需注音：`{字}`
- 圆括号为整词注释

### 5. 着重 — `*文本*`

```
*孔子*云：何陋之有？
```

- 支持递归嵌套其他内联语法
- 不可跨行

---

## 段落分组机制

`paragraph` 和紧跟的 `translation` 合并为 `paragraph_group`：

```
解析结果: [paragraph("A"), translation("译A"), paragraph("B")]
分组结果: [paragraph_group(paragraph("A"), translation("译A")), paragraph_group(paragraph("B"), null)]
```

---

## AST 节点类型

### Block 节点

| 类型 | 属性 |
|------|------|
| `document` | `meta`, `children` |
| `heading` | `level` (1-3), `children` |
| `paragraph` | `children` |
| `translation` | `children` |
| `paragraph_group` | `paragraph`, `translation` |
| `poetry_block` | `title`, `meta`, `lines` |
| `blockquote` | `children` |
| `section_break` | — |
| `proofread_date` | `date` |

### Inline 节点

| 类型 | 属性 |
|------|------|
| `text` | `value` |
| `ruby` | `base`, `annotation` |
| `annotate` | `text`, `note` |
| `ruby_annotate` | `items[]`, `note` |
| `emphasis` | `children` |

---

## HTML 渲染映射

| AST 类型 | HTML 输出 |
|----------|-----------|
| `heading` N | `<h{N+1}>...</h{N+1}>` |
| `paragraph_group` | `<div class="wyw-para-group"><p>...</p><p class="wyw-translation">...</p></div>` |
| `poetry_block` | `<div class="wyw-poetry"><h1>...</h1><p class="wyw-verse">...</p></div>` |
| `blockquote` | `<blockquote><p>...</p></blockquote>` |
| `section_break` | `<hr class="wyw-hr">` |
| `proofread_date` | `<footer class="wyw-proofread">校对于：...</footer>` |

| Inline AST | HTML |
|------------|------|
| `text` | 转义纯文本 |
| `ruby` | `<ruby>字<rp>(</rp><rt>拼音</rt><rp>)</rp></ruby>` |
| `annotate` | `<span class="wyw-annotate" data-note="释义">词</span>` |
| `ruby_annotate` | `<ruby><span class="wyw-annotate" data-note="释义">...</span><rp>(</rp><rt>拼音</rt><rp>)</rp></ruby>` |
| `emphasis` | `<em>...</em>` |