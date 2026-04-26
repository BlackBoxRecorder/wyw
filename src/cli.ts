// CLI 逻辑

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  watchFile,
} from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { compile } from "./index.js";
import type { CompileOptions } from "./index.js";
import { validate, formatValidationResult } from "./validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "assets");

interface BuildOptions {
  output?: string;
  inline: boolean;
  watch: boolean;
  theme: string;
  showTranslation: boolean;
}

export function createCli(): Command {
  const program = new Command();

  program.name("wyw").description("文言文标记语言编译器").version("0.1.0");

  program
    .command("build")
    .description("编译 .wyw 文件为 HTML")
    .argument("<files...>", ".wyw 文件路径")
    .option("-o, --output <dir>", "输出目录")
    .option("--inline", "内联 CSS/JS 到 HTML 中", false)
    .option("-w, --watch", "监听文件变化并自动重编译", false)
    .option("--theme <mode>", "默认主题 (auto/light/dark)", "auto")
    .option("--show-translation", "默认显示译文", true)
    .option("--no-show-translation", "默认隐藏译文")
    .action((files: string[], options: BuildOptions) => {
      buildFiles(files, options);

      if (options.watch) {
        console.log("\n监听文件变化中... (Ctrl+C 退出)");
        for (const file of files) {
          const filePath = resolve(file);
          watchFile(filePath, { interval: 500 }, () => {
            console.log(`\n检测到变化: ${basename(filePath)}`);
            buildFiles([file], options);
          });
        }
      }
    });

  program
    .command("init")
    .description("创建模板 .wyw 文件")
    .action(() => {
      const template = `---
title: 标题
author: 作者
dynasty: 朝代
---

# 标题

正文内容，可使用{注|zhù}{音|yīn}标注，[生词](词语解释)注释。

>> 现代汉语翻译文本

第二段正文，支持*着重标记*标注。

>> 第二段翻译

::: poetry
# 诗词标题
:: [朝代]作者

诗词第一句，
诗词第二句。
:::
`;
      const outPath = resolve("template.wyw");
      writeFileSync(outPath, template, "utf-8");
      console.log(`已创建模板文件: ${outPath}`);
    });

  program
    .command("validate")
    .description("验证 .wyw 文件格式")
    .argument("<file>", ".wyw 文件路径")
    .option("--strict", "将所有提示升级为错误", false)
    .action((file: string, options: { strict: boolean }) => {
      try {
        const filePath = resolve(file);
        const source = readFileSync(filePath, "utf-8");
        const result = validate(source, {
          strict: options.strict,
          filePath,
        });
        console.log(formatValidationResult(result));
        process.exit(result.errors.length > 0 ? 1 : 0);
      } catch (err) {
        console.error(`无法读取文件: ${file}`);
        console.error(`  ${(err as Error).message}`);
        process.exit(1);
      }
    });

  return program;
}

function buildFiles(files: string[], options: BuildOptions): void {
  for (const file of files) {
    try {
      const filePath = resolve(file);
      const source = readFileSync(filePath, "utf-8");

      const html = compile(source, {
        inline: options.inline,
        theme: options.theme,
        showTranslation: options.showTranslation,
      });

      // 确定输出路径
      const outputDir = options.output
        ? resolve(options.output)
        : dirname(filePath);
      mkdirSync(outputDir, { recursive: true });

      const htmlName = basename(filePath, ".wyw") + ".html";
      const htmlPath = join(outputDir, htmlName);
      writeFileSync(htmlPath, html, "utf-8");

      // 非内联模式时复制 CSS 和 JS
      if (!options.inline) {
        copyFileSync(join(ASSETS_DIR, "wyw.css"), join(outputDir, "wyw.css"));
        copyFileSync(join(ASSETS_DIR, "wyw.js"), join(outputDir, "wyw.js"));
      }

      // 复制 favicon
      copyFileSync(
        join(ASSETS_DIR, "favicon.png"),
        join(outputDir, "favicon.png"),
      );

      // 统计信息
      const stats = collectStats(source);
      console.log(
        `  ${htmlName} (${stats.paragraphs} 段, ${stats.annotations} 注释, ${stats.rubies} 注音)`,
      );
    } catch (err) {
      console.error(`  ${basename(file)}: ${(err as Error).message}`);
    }
  }
}

function collectStats(source: string): {
  paragraphs: number;
  annotations: number;
  rubies: number;
} {
  const annotations = (source.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  const rubies = (source.match(/\{[^|{}]+\|[^}]+\}/g) || []).length;
  const paragraphs = source.split("\n\n").filter((block) => {
    const t = block.trim();
    return (
      t && !t.startsWith("---") && !t.startsWith(">>") && !t.startsWith("#")
    );
  }).length;

  return { paragraphs, annotations, rubies };
}
