#!/usr/bin/env node
// .wyw 文件格式校验脚本
// 用法: node skill/wyw-writer/scripts/validate.js <file.wyw> [--strict]
// 推荐使用 CLI: wyw validate <file.wyw> [--strict]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const fileArg = process.argv[2];
  const strict = process.argv.includes("--strict");

  if (!fileArg) {
    console.log(
      "用法: node skill/wyw-writer/scripts/validate.js <file.wyw> [--strict]",
    );
    console.log("");
    console.log("选项:");
    console.log("  --strict    将所有提示升级为错误");
    console.log("");
    console.log("推荐使用 CLI:");
    console.log("  wyw validate <file.wyw> [--strict]");
    process.exit(1);
  }

  const filePath = resolve(fileArg);

  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error("无法读取文件: " + filePath);
    console.error("  " + err.message);
    process.exit(1);
  }

  let validate, formatValidationResult;
  try {
    const mod = await import("../../../dist/validator.js");
    validate = mod.validate;
    formatValidationResult = mod.formatValidationResult;
  } catch (err) {
    console.error("无法加载验证模块，请先编译项目: npm run build");
    console.error("  " + err.message);
    process.exit(1);
  }

  const result = validate(content, { strict, filePath });
  console.log(formatValidationResult(result));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("校验脚本执行失败: " + err.message);
  process.exit(1);
});
