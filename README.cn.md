# @isdk/json-repair

> 【[English](./README.md)|中文】

---

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
- **平衡定界符追踪**：正确处理 DSL 风格字符串（如 `@func(a, b)`）内部嵌套在括号、方括号或花括号中的结构化符号（逗号、冒号等）。
- **“奇偶判定法”**：完美解决嵌套引号歧义（例如准确区分 `"A" OR "B"` 和 `"a"b"`）。
- **语义强制转换 (Coercion)**：
  - **枚举模糊匹配**：如果 Schema 定义了枚举，能将 `"Processing!"` 自动匹配为 `"processing"`。
  - **噪声数字提取**：能从 `"约 1,200.50 元"` 中提取出 `1200.5`。
  - **布尔值变体**：识别 `yes/no`、`on/off`、`1/0`、`确定/取消`、`是/否` 为布尔值。
- **隐式结构支持**：自动修复对象或数组中缺失的花括号。
- **稳当的属性边界**：带引号的键名可以含空格与标点（`"Official language": "Italian"`）；Schema 声明过的多词键名，即使文档里没加引号也能被识别；能完整解析的值不会被重新切分，因此合法 JSON 的产物与 `JSON.parse` 完全一致。
- **模糊键名匹配**：`user_name`、`userName`、`USER NAME` 都会归位到 Schema 声明的属性名，输出里用的就是声明的名字。
- **原型安全的输出**：`__proto__`、`constructor` 这类键名存为自身的普通属性，与 `JSON.parse` 的处理一致。
- **高性能**：支持复用 `SchemaWalker` 实例，适用于高吞吐量的批处理场景。

## 📦 安装

```bash
pnpm add @isdk/json-repair @apidevtools/json-schema-ref-parser
```

## 🛠 用法

### 1. Schema 引导修复 (推荐)

这是最强大的使用方式。提供 Schema 可以开启语义强制转换、贪婪捕获和更精准的歧义消除等高级特性。

```typescript
import { jsonRepair } from '@isdk/json-repair'

const schema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    status: { enum: ['success', 'error'] },
  },
}

const brokenJson = '{ query: "python" OR "js", status: Success! }'

const result = await jsonRepair(brokenJson, schema)
console.log(result)
// 输出: { query: '"python" OR "js"', status: 'success' }

// Schema 声明过的多词键名，即使文档里没加引号也能被识别。
const countrySchema = {
  type: 'object',
  properties: {
    Capital: { type: 'string' },
    'Official language': { type: 'string' },
  },
}

console.log(
  await jsonRepair(
    '{ Capital: Berlin, Official language: Italian }',
    countrySchema
  )
)
// 输出: { Capital: 'Berlin', 'Official language': 'Italian' }
```

### 2. 简单用法 (不使用 Schema)

对于基础的语法修复，你可以不提供 Schema：

```typescript
import { jsonRepair } from '@isdk/json-repair'

const result = await jsonRepair('{ name: 张三, age: 30 }')
console.log(result) // { name: '张三', age: 30 }

// 带引号的键名可以包含空格与标点；合法 JSON 会被原样保留。
const country = await jsonRepair(
  '{ "Capital": "Berlin", "Official language": "Italian" }'
)
console.log(country) // { Capital: 'Berlin', 'Official language': 'Italian' }
```

### 高级技巧：复用 SchemaWalker (批处理)

如果你需要使用相同的 Schema 处理大量数据，预解析 Schema 可以显著提升性能：

```typescript
import { jsonRepair, SchemaWalker } from '@isdk/json-repair'

// 与 Schema 本身相关的选项（`keyMatching`）属于 walker。
const walker = await SchemaWalker.create(mySchema, { keyMatching: true })

for (const item of brokenItems) {
  const result = await jsonRepair(item, walker)
  // ...
}
```

## 🧭 属性边界是如何判定的

在修复一个值的过程中，解析器必须在每个位置上判断接下来的 `"foo":` 是**下一个属性**的起点，还是**当前值**的一部分。它分为两种模式：

1. **结构模式 (Structural mode)** —— 适用于刚刚由严格 JSON 路径解析成功的值（成对的 `"string"`、格式合法的数字、`true`/`false`/`null`）。
   此时任何“键形状 + `:`”都被视为下一个属性，**包括含空格或标点的引号键名**（如 `"Official language":`、`"a, b":`、`"a: b":`）。
   一次成功的严格解析**永远不会被丢弃**，这正是“合法 JSON 的产物与 `JSON.parse` 一致”这条不变量的来源。
2. **贪婪模式 (Greedy mode)** —— 适用于无法严格解析的值（无引号文本、内部引号未转义、`"A" OR "B"` 表达式、`@func(a="x, y")` 这类 DSL 片段）。
   - 如果 Schema 在当前层级声明了属性名，则**只在已声明的键名处断开**。仅仅是“看起来像键”的文本会留在值里：
     `{ "query": he said "hello there": loudly, "intent": "x" }` 会得到 `query = 'he said "hello there": loudly'`。
   - 如果当前层级没有任何声明的属性名（无 Schema、只有 `type: "object"` 没有 `properties`、或只写了 `additionalProperties`），则退回到“第一个键形状的 token 即结束值”。
   - **已声明**的键名还会被按字面量搜索，因此即使文档里没加引号、且键名内部含空格，它依然是断点（也是键）。通用键扫描器看不出裸的 `Official language:` 是一个键，而 Schema 能告诉你：
     `{ Capital: Berlin, Official language: Italian }` 会得到 `{ Capital: 'Berlin', 'Official language': 'Italian' }`。开启 `keyMatching` 后，已声明键名的分隔符与大小写变体（`user_name` 对应 `userName`）同样会结束一个值。

   将 `stringCaptureStrategy: 'conservative'` 可以让贪婪模式不管 Schema 声明与否，都在任意“键形状 + `:`”处结束（参见[修复选项](#-修复选项)）。

### 如何理解这套启发式

歧义的本质是信息缺失，而不是魔法：`{ "note": see "foo bar": baz here, "b": 2 }` 在没有 Schema 时无法判定，因为两种解读都说得通。解析器遵循的原则是：

- **能干净解析**的值会被信任；它后面的东西被当作结构。
- **本身已破碎**的值，只要 Schema 能给出真正的锚点，就尽量作为文本保留。
- Schema **声明过**的键名会被按字面量匹配，所以多词键名在文档里不加引号也能被识别；而 Schema 未声明的多词文本永远不会被当成键。
- 因此，**为当前层级声明 `properties` 是引导修复效果最显著的手段** —— 已声明的键名是贪婪捕获的断点，已声明的 `type`/`enum` 才能开启语义强制转换。
- 如果值里可能合法地出现 `word:` 或 `"phrase":`，要么让模型输出正确转义的 JSON（严格解析直接胜出），要么在 Schema 里声明该层级的属性。
- 如果某个值在“看起来像键”的地方被截断，通常是你的 Schema 在该层级缺少 `properties` —— 补上后重试。

数字字面量支持科学计数法（`1e5`、`-2E2`），也容忍 LLM 常见的 `+5`、`.5`、`5.`。而 `1.2.3` 这种不完整的字面量会先作为字符串保留，再按 Schema 做强制转换。

## ⚠️ 注意事项与歧义说明

- **“奇偶判定法”逻辑**：当字符串被引号包裹且内部包含引号时，我们会计算内部引号的数量。
  - 奇数个 (如 `"a"b"`)：认为外层是定界符 -> 结果 `a"b`。
  - 偶数个 (如 `"A" OR "B"`)：认为外层是内容的一部分 -> 结果 `"A" OR "B"`。
  - **局限性**：极少数极端模式如 `"a"b"c"` 可能仍存在歧义。
- **破碎值内部“看起来像键”的文本（无 Schema 引导时）**：当前层级没有声明任何属性名时，第一个键形状的 token 就会结束该值。
  因此无 Schema 的 `{ "note": see "foo bar": baz here, "b": 2 }` 会被读成 `{ note: 'see', 'foo bar': 'baz here', b: 2 }`。
  声明该层级的 `properties` 后，贪婪捕获只在真正的键名处断开，才能还原成 `{ note: 'see "foo bar": baz here', b: 2 }`（参见[如何理解这套启发式](#如何理解这套启发式)）。
- **未加引号的多词键名必须有声明。** `{ Capital: Berlin, Official language: Italian }` 能拆成两个属性，是因为 Schema 声明了 `Official language`。若文档里的带空格键名 _没有_ 声明，它就不是键：`{ Capital: Berlin, Official Lang: Italian }` 在默认的 `'aggressive'` 策略下会把整段都留在 `Capital` 里；改用 `'conservative'` 则会在空格处断开（`{ Capital: 'Berlin, Official', Lang: 'Italian' }`）。
- **值里重复出现已声明的键名时会被截断。** 声明过的键就是断点，所以 `{ summary: the Official language: Italian is wrong, Official language: Italian }` 会读成 `summary = 'the'`。如果值确实可能重复某个已声明的键名，就让模型给键加引号，或者换一个不会碰撞的属性名。
- **Markdown 代码块**：本库专注于 JSON 内容修复。如果 LLM 的输出包含 `json ...` 标记，请在传入前自行剥离。

## ⚙️ 修复选项

`jsonRepair(input, schema, options)` 的第三个参数就是 `RepairOptions`：

| 选项                    | 默认值         | 作用                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coerceTypes`           | `true`         | 按 Schema 声明的类型做强制转换：`"约 1,200.50 元"` → `1200.5`、`"yes"` → `true`、枚举内的 `"Processing!"` → `"processing"`。                                                                                                                                                                                                                                                               |
| `keyMatching`           | `false`        | 把输入键名解析成 Schema 声明的属性名。`true` 忽略大小写和分隔符，`user_name`、`userName`、`USER NAME` 均匹配 `userName`；也可以传 `(key, properties) => string \| undefined` 自定义映射（返回 `undefined` 则保留原键名）。命中后输出里的键名会被改写，该子树的类型转换也随之生效。开启 `true` 时它同时决定贪婪捕获在哪里断开：Schema 声明了 `userName`，那么 `user_name:` 就会结束一个值。 |
| `additionalProperties`  | `'keep'`       | `'remove'` 丢弃 Schema 未声明的键，且只在确实声明了 `properties` 的层级生效 —— 自由结构没有“多余键”的概念，保持原样。它与 JSON Schema 关键字 `additionalProperties: false` 互不影响，后者单独生效。                                                                                                                                                                                        |
| `stringCaptureStrategy` | `'aggressive'` | `'conservative'`：贪婪捕获在任意“键形状 + `:`”处结束，而不再只在 Schema 声明的键名处结束。代价是值更容易被截断，好处是一个破碎的值不会吞掉后面的一大片内容。                                                                                                                                                                                                                               |

```typescript
const schema = {
  type: 'object',
  properties: {
    userName: { type: 'string' },
    userAge: { type: 'number' },
  },
}

await jsonRepair('{ user_name: "Ada", user_age: "36" }', schema, {
  keyMatching: true,
  coerceTypes: true,
})
// { userName: 'Ada', userAge: 36 }

await jsonRepair('{ userName: "Ada", reasoning: "让我想想…" }', schema, {
  additionalProperties: 'remove',
})
// { userName: 'Ada' }

const querySchema = {
  type: 'object',
  properties: { query: { type: 'string' }, intent: { type: 'string' } },
}

await jsonRepair(
  '{ "query": he said "hello there": loudly, "intent": "x" }',
  querySchema,
  { stringCaptureStrategy: 'conservative' }
)
// { query: 'he said', 'hello there': 'loudly', intent: 'x' }
```

复用 walker 时，`keyMatching` 取自 `SchemaWalker.create()` 的选项；其余选项在每次 `jsonRepair()` 调用时读取。

## 📄 开源协议

MIT © Riceball LEE
