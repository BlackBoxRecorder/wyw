# 文言文标记语言编译器

> 将 `.wyw` 文件编译为排版精美的 HTML 页面，支持注音、注释、译文等文言文阅读辅助功能。

编写一个 `.wyw` 文件(loushiming.wyw)如下：
![wyw](/docs/images/wyw.png)

运行：
```bash
npx wyw build loushiming.wyw
```

生成 HTML 如下：

![render](/docs/images/render.png)


## 功能特性

- **注音标注**：使用 Ruby 标注为汉字添加拼音
- **词语注释**：悬停查看生词释义
- **现代文翻译**：段落对照式译文展示
- **明暗主题**：支持自动/浅色/深色主题切换
- **诗词围栏**：专门的诗词排版支持
- **字体缩放**：支持标准/中号/大号三种字号

## 安装

```bash
npm install
```

## 命令行使用

### 基本命令

```bash
# 编译单个文件
node bin/wyw.js build examples/lousiming.wyw

# 指定输出目录
node bin/wyw.js build examples/lousiming.wyw -o output/

# 编译多个文件
node bin/wyw.js build examples/*.wyw -o examples/dist/
```

### 编译选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-o, --output <dir>` | 指定输出目录 | `-o dist/` |
| `--inline` | 将 CSS/JS 内联到 HTML 中 | `--inline` |
| `-w, --watch` | 监听文件变化自动重编译 | `-w` |
| `--theme <mode>` | 默认主题 (auto/light/dark) | `--theme dark` |
| `--show-translation` | 默认显示译文（默认开启） | `--show-translation` |
| `--no-show-translation` | 默认隐藏译文 | `--no-show-translation` |


### 开发命令

```bash
# 编译 TypeScript 源码
npm run build

# 监听模式编译
npm run dev

# 运行测试
npm test

# 编译示例文件
npm run build:examples

```


### 创建模板

快速创建一个 `.wyw` 模板文件：

```bash
node bin/wyw.js init
```

这会生成 `template.wyw` 文件，包含完整的语法示例。


## 标记语法简介

| 语法 | 用途 | 示例 |
|------|------|------|
| `---` | Frontmatter 分隔 / 分隔线 | `---\ntitle: 陋室铭\n---` |
| `#` `##` `###` | 标题 | `# 一级标题` |
| `>>` | 现代文翻译 | `>> 现代汉语翻译` |
| `>` | 引用 | `> 引用内容` |
| `:::` | 诗词围栏块 | `::: poetry\n诗词内容\n:::` |
| `:: text` | 围栏元信息 | `:: [唐]李白` |
| `{字\|拼音}` | 注音 | `{仙\|xiān}` |
| `[词](释义)` | 注释 | `[陋室](简陋的屋子)` |
| `[{字\|拼音}](释义)` | 注音+注释 | `[{晓\|xiǎo}](天刚亮的时候)` |
| `*文本*` | 着重 | `*强调*` |
| `---`（3+ 连字符） | 分隔线 | `---` |
| `--YYYY年M月D日--` | 校对日期 | `--2024年1月15日--` |

详细语法说明请参阅 [docs/syntax-guide.md](docs/syntax-guide.md)。

## 项目结构

```
mobai/
├── bin/wyw.js          # CLI 入口
├── src/
│   ├── cli.ts          # 命令行逻辑
│   ├── index.ts        # 编译器主入口
│   ├── parser/         # 解析器（ast, block-parser, inline-parser, frontmatter）
│   ├── renderer/       # HTML 渲染器（html-renderer, page-template）
│   ├── templates/      # Handlebars 模板（page, homepage）
│   └── assets/         # 静态资源（CSS, JS, 图标）
├── docs/               # 文档
├── test/               # 测试
└── examples/           # 示例 .wyw 文件
```

## 许可证

MIT
