import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  formatValidationResult,
  Validator,
} from "../src/validator.js";

// === Validator 类测试 ===
describe("Validator", () => {
  it("默认模式：error 进 errors，warn 进 warnings", () => {
    const v = new Validator();
    v.error(1, "错误");
    v.warn(2, "提示");
    assert.equal(v.errors.length, 1);
    assert.equal(v.warnings.length, 1);
  });

  it("strict 模式：warn 升级为 error", () => {
    const v = new Validator(true);
    v.error(1, "错误");
    v.warn(2, "提示");
    assert.equal(v.errors.length, 2);
    assert.equal(v.warnings.length, 0);
  });
});

// === Frontmatter 检查 ===
describe("validate - Frontmatter", () => {
  it("完整的 frontmatter 无警告", () => {
    const source = `---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
---

正文`;
    const result = validate(source);
    assert.equal(result.errors.length, 0);
    const missingTitle = result.warnings.some((w) => w.msg.includes("title"));
    assert.equal(missingTitle, false);
  });

  it("缺少 frontmatter 给出提示", () => {
    const result = validate("正文内容");
    assert.ok(result.warnings.some((w) => w.msg.includes("Frontmatter")));
  });

  it("frontmatter 未闭合报错误", () => {
    const source = `---
title: 测试
正文`;
    const result = validate(source);
    assert.ok(result.errors.some((w) => w.msg.includes("未闭合")));
  });

  it("缺少 title/author/dynasty 字段给出提示", () => {
    const source = `---
source: 某处
---

正文`;
    const result = validate(source);
    assert.ok(result.warnings.some((w) => w.msg.includes("title")));
    assert.ok(result.warnings.some((w) => w.msg.includes("author")));
    assert.ok(result.warnings.some((w) => w.msg.includes("dynasty")));
  });

  it("未知字段给出提示", () => {
    const source = `---
title: 测试
unknown: 值
---

正文`;
    const result = validate(source);
    assert.ok(result.warnings.some((w) => w.msg.includes("未知字段")));
  });

  it("空文件报错误", () => {
    const result = validate("");
    assert.ok(result.errors.some((e) => e.msg.includes("文件为空")));
  });
});

// === 括号匹配检查（栈式检测） ===
describe("validate - Bracket Balance", () => {
  it("大括号未闭合报错误", () => {
    const result = validate("{未闭合");
    assert.ok(result.errors.some((e) => e.msg.includes("未闭合")));
  });

  it("方括号未闭合报错误", () => {
    const result = validate("[未闭合");
    assert.ok(result.errors.some((e) => e.msg.includes("未闭合")));
  });

  it("圆括号未闭合报错误", () => {
    const result = validate("(未闭合");
    assert.ok(result.errors.some((e) => e.msg.includes("未闭合")));
  });

  it("括号交叉嵌套报错误（如 [{...} ）", () => {
    const result = validate("[{词|pinyin}]"); // 正确写法，不报错
    // 交叉嵌套: [{...}  其中 { 在 [ 后但 ] 先于 } 闭合 — 这是正确的
    // 真正的交叉嵌套: {[...]} 类型交叉
    const result2 = validate("{文[字}注释]");
    assert.ok(result2.errors.some((e) => e.msg.includes("交叉嵌套")));
  });

  it("多余闭合括号报错误", () => {
    const result = validate("文本}多余");
    assert.ok(result.errors.some((e) => e.msg.includes("多余的闭合括号")));
  });

  it("正常嵌套不报错", () => {
    const result = validate("[{词|yǔ}](注)");
    assert.equal(
      result.errors.some(
        (e) => e.msg.includes("未闭合") || e.msg.includes("交叉嵌套"),
      ),
      false,
    );
    assert.equal(result.errors.length, 0);
  });

  it("着重标记未成对报提示", () => {
    const result = validate("*单个星号");
    assert.ok(result.warnings.some((w) => w.msg.includes("着重标记")));
  });
});

// === 注音格式检查（模式感知） ===
describe("validate - Ruby Format", () => {
  it("多字注音报提示", () => {
    const result = validate("{汉字|hàn zì}");
    assert.ok(result.warnings.some((w) => w.msg.includes("多字")));
  });

  it("strict 模式下多字注音报错误", () => {
    const result = validate("{汉字|hàn zì}", { strict: true });
    assert.ok(result.errors.some((e) => e.msg.includes("多字")));
  });

  it("拼音含数字报提示", () => {
    const result = validate("{字|zi4}");
    assert.ok(result.warnings.some((w) => w.msg.includes("数字")));
  });

  it("拼音含非法大括号报错误", () => {
    const result = validate("{字|z{i}");
    assert.ok(result.errors.some((e) => e.msg.includes("非法字符")));
  });

  it("单字注音无错误", () => {
    const result = validate("{字|zì}");
    assert.equal(
      result.errors.some(
        (e) => e.msg.includes("多字") || e.msg.includes("非法字符"),
      ),
      false,
    );
    assert.equal(result.errors.length, 0);
  });
});

// === 注释格式检查（模式感知） ===
describe("validate - Annotate Format", () => {
  it("空释义报提示", () => {
    const result = validate("[词]()");
    assert.ok(result.warnings.some((w) => w.msg.includes("释义为空")));
  });

  it("注音+注释组合不触发空词条误报", () => {
    const source = "[{字|pīn}](释义)";
    const result = validate(source);
    assert.equal(
      result.errors.some((e) => e.msg.includes("词条为空")),
      false,
    );
    assert.equal(result.errors.length, 0);
  });

  it("含有注音的文本不误匹配为注释", () => {
    // 如果 text 内含 {x|y}，应跳过注释匹配
    const result = validate("[文{字|zì}本](释义)");
    // 不会被提取为 annotate，不会报"词条为空"
    const annoErrors = result.errors.filter(
      (e) => e.msg.includes("词条为空") || e.msg.includes("释义为空"),
    );
    assert.equal(annoErrors.length, 0);
  });
});

// === 注音+注释组合校验 ===
describe("validate - Ruby Annotate Format", () => {
  it("正常组合无错误", () => {
    const source = `---
title: 测试
author: 作者
dynasty: 唐
---

[{斯|sī}{是}{陋|lòu}{室}](这是简陋的屋子)`;
    const result = validate(source);
    assert.equal(
      result.errors.some(
        (e) =>
          e.msg.includes("多字") ||
          e.msg.includes("非法字符") ||
          e.msg.includes("无有效"),
      ),
      false,
    );
  });

  it("组合中多字注音报提示", () => {
    const result = validate("[{汉字|hàn zì}](释义)");
    assert.ok(result.warnings.some((w) => w.msg.includes("多字")));
  });

  it("strict 模式下组合中多字注音报错误", () => {
    const result = validate("[{汉字|hàn zì}](释义)", { strict: true });
    assert.ok(result.errors.some((e) => e.msg.includes("多字")));
  });

  it("组合释义为空报提示", () => {
    const result = validate("[{字|zì}]()");
    assert.ok(result.warnings.some((w) => w.msg.includes("释义为空")));
  });

  it("组合内无注音块报错误", () => {
    const result = validate("[文字](释义)");
    // 这是普通注释，不是 ruby_annotate，不应报"无有效注音块"
    assert.equal(
      result.errors.some((e) => e.msg.includes("无有效注音块")),
      false,
    );
    assert.equal(result.errors.length, 0);
  });

  it("组合内拼音含数字报提示", () => {
    const result = validate("[{字|zi4}{词|ci2}](释义)");
    assert.ok(result.warnings.some((w) => w.msg.includes("数字")));
  });
});

// === 诗词围栏块检查 ===
describe("validate - Fenced Blocks", () => {
  it("围栏块未闭合报错误", () => {
    const source = `::: poetry
# 标题
:: 作者

内容
`;
    const result = validate(source);
    assert.ok(result.errors.some((e) => e.msg.includes("未闭合")));
  });

  it("围栏块类型非 poetry 报提示", () => {
    const source = `::: prose
内容
:::
`;
    const result = validate(source);
    assert.ok(result.warnings.some((w) => w.msg.includes("poetry")));
  });

  it("围栏内空元信息报提示", () => {
    const source = `::: poetry
#
::

内容
:::
`;
    const result = validate(source);
    assert.ok(result.warnings.some((w) => w.msg.includes("元信息为空")));
  });

  it("正确闭合的围栏块无错误", () => {
    const source = `::: poetry
# 标题
:: [唐]李白

诗句
:::
`;
    const result = validate(source);
    assert.equal(
      result.errors.some((e) => e.msg.includes("未闭合")),
      false,
    );
  });
});

// === 译文配对检查 ===
describe("validate - Translation Pairing", () => {
  it("译文前缺少段落报提示", () => {
    const source = `---
title: 测试
author: 作者
dynasty: 唐
---

>> 孤立的译文`;
    const result = validate(source);
    assert.ok(
      result.warnings.some((w) => w.msg.includes("缺少对应的文言文段落")),
    );
  });

  it("正常段落+译文配对无提示", () => {
    const source = `段落内容

>> 译文`;
    const result = validate(source);
    assert.equal(
      result.warnings.some((w) => w.msg.includes("缺少对应的文言文段落")),
      false,
    );
  });
});

// === 解析器深度校验 ===
describe("validate - Parser Check", () => {
  it("有效文档返回统计信息", () => {
    const source = `---
title: 测试
author: 作者
dynasty: 唐
---

# 标题

段落内容

>> 译文

::: poetry
# 诗词
:: [唐]李白

诗句
:::
`;
    const result = validate(source);
    assert.ok(result.stats);
    assert.equal(result.stats!.paragraphGroups, 1);
    assert.equal(result.stats!.poetryBlocks, 1);
    assert.equal(result.stats!.headings, 1);
  });

  it("统计注释和注音数量", () => {
    const source = `有{仙|xiān}则名，[斯](这)是陋室。`;
    const result = validate(source);
    assert.ok(result.stats);
    assert.equal(result.stats!.annotations, 1);
    assert.equal(result.stats!.rubies, 1);
  });
});

// === 格式化输出 ===
describe("formatValidationResult", () => {
  it("通过时显示格式校验通过", () => {
    const result = {
      errors: [],
      warnings: [],
      stats: undefined,
    };
    const output = formatValidationResult(result);
    assert.ok(output.includes("格式校验通过"));
  });

  it("仅提示时显示无严重错误", () => {
    const result = {
      errors: [],
      warnings: [{ line: 1, msg: "提示" }],
      stats: undefined,
    };
    const output = formatValidationResult(result);
    assert.ok(output.includes("无严重错误"));
    assert.ok(output.includes("提示:"));
  });

  it("有错误时显示错误列表", () => {
    const result = {
      errors: [{ line: 2, msg: "错误信息" }],
      warnings: [],
      stats: undefined,
    };
    const output = formatValidationResult(result);
    assert.ok(output.includes("错误:"));
    assert.ok(output.includes("第 2 行: 错误信息"));
  });

  it("包含统计信息", () => {
    const result = {
      errors: [],
      warnings: [],
      stats: {
        paragraphGroups: 1,
        poetryBlocks: 0,
        headings: 1,
        annotations: 2,
        rubies: 3,
      },
    };
    const output = formatValidationResult(result);
    assert.ok(output.includes("解析统计:"));
    assert.ok(output.includes("1 段落组"));
    assert.ok(output.includes("标注统计:"));
    assert.ok(output.includes("2 注释, 3 注音"));
  });
});

// === strict 模式 ===
describe("validate - strict mode", () => {
  it("strict 模式将提示升级为错误", () => {
    const source = `段落内容

>> 孤立的译文`;
    const result = validate(source, { strict: true });
    assert.ok(result.errors.length > 0);
    assert.equal(result.warnings.length, 0);
  });
});
