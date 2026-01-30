# @isdk/json-repair

一个强大的、基于 Schema 引导的 JSON 修复库，专为修复大语言模型 (LLM) 生成的“破碎” JSON 而设计。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/@isdk%2Fjson-repair.svg)](https://www.npmjs.com/package/@isdk/json-repair)

## 🚀 为什么选择这个库？

LLM 生成的 JSON 经常包含语法错误或语义噪声。常见问题包括：

- 键或值缺少引号。
- 字符串内部引号未转义（例如 `"a"b"`）。
- 缺少逗号或结尾花括号。
- 值中混合了自然语言（例如 `"age": "大约 30 岁"`）。
- 隐式结构（例如数组中的对象缺少花括号）。

传统的 `json-repair` 库仅在语法层面打补丁。**@isdk/json-repair** 利用 **JSON Schema** 作为导航图，智能地解析、修复并将数据强制转换为符合规范的结构化对象。

## ✨ 核心特性

- **Schema 引导修复**：利用 Schema 解决歧义（例如通过判断冒号后面是否跟着 Schema 定义的 Key 来决定它是定界符还是字符串内容）。
- **贪婪字符串捕获**：智能捕获未加引号或破碎的字符串，直到遇到下一个合法的 Schema 键名。
- **“奇偶判定法”**：完美解决嵌套引号歧义（例如准确区分 `"A" OR "B"` 和 `"a"b"`）。
- **语义强制转换 (Coercion)**：
  - **枚举模糊匹配**：如果 Schema 定义了枚举，能将 `"Processing!"` 自动匹配为 `"processing"`。
  - **噪声数字提取**：能从 `"约 1,200.50 元"` 中提取出 `1200.5`。
  - **布尔值变体**：识别 `yes/no`、`on/off`、`1/0`、`确定/取消`、`是/否` 为布尔值。
- **隐式结构支持**：自动修复对象或数组中缺失的花括号。
- **高性能**：支持复用 `SchemaWalker` 实例，适用于高吞吐量的批处理场景。

## 📦 安装

```bash
pnpm add @isdk/json-repair @apidevtools/json-schema-ref-parser
```

## 🛠 用法

### 基础示例

```typescript
import { jsonRepair } from '@isdk/json-repair';

const schema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    status: { enum: ['success', 'error'] }
  }
};

const brokenJson = '{ query: "python" OR "js", status: 成功 }';

const result = await jsonRepair(brokenJson, schema);
console.log(result);
// 输出: { query: '"python" OR "js"', status: 'success' }
```

### 高级技巧：复用 SchemaWalker (批处理)

如果你需要使用相同的 Schema 处理大量数据，预解析 Schema 可以显著提升性能：

```typescript
import { jsonRepair, SchemaWalker } from '@isdk/json-repair';

const walker = await SchemaWalker.create(mySchema);

for (const item of brokenItems) {
  const result = await jsonRepair(item, walker);
  // ...
}
```

## ⚠️ 注意事项与歧义说明

- **“奇偶判定法”逻辑**：当字符串被引号包裹且内部包含引号时，我们会计算内部引号的数量。
  - 奇数个 (如 `"a"b"`)：认为外层是定界符 -> 结果 `a"b`。
  - 偶数个 (如 `"A" OR "B"`)：认为外层是内容的一部分 -> 结果 `"A" OR "B"`。
  - **局限性**：极少数极端模式如 `"a"b"c"` 可能仍存在歧义。
- **Markdown 代码块**：本库专注于 JSON 内容修复。如果 LLM 的输出包含 ```json ...``` 标记，请在传入前自行剥离。

## 📄 开源协议

MIT © Riceball LEE
