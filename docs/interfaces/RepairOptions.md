[**@isdk/json-repair**](../README.md)

***

[@isdk/json-repair](../globals.md) / RepairOptions

# Interface: RepairOptions

Defined in: [types.ts:4](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/types.ts#L4)

Options for the JSON repair process.

## Properties

### additionalProperties?

> `optional` **additionalProperties**: `"keep"` \| `"remove"`

Defined in: [types.ts:35](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/types.ts#L35)

Defines how to handle properties not defined in the Schema.

- `'keep'` (default): Keeps these extra properties in the output.
- `'remove'`: Automatically removes properties not found in the Schema.

***

### coerceTypes?

> `optional` **coerceTypes**: `boolean`

Defined in: [types.ts:27](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/types.ts#L27)

Whether to attempt type coercion based on the Schema.

If `true`, the parser will try to convert values to the expected type (e.g., "123" to 123 for numbers, "yes" to true for booleans).

***

### keyMatching?

> `optional` **keyMatching**: `boolean` \| (`key`, `properties`) => `string` \| `undefined`

Defined in: [types.ts:12](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/types.ts#L12)

Fuzzy matching for keys.

- `false` (default): Strict matching against the Schema defined keys.
- `true`: Allows case-insensitive matching and conversion between snake_case and camelCase.
- `(key: string, properties: string[]) => string | undefined`: Custom mapping logic to find a matching property name.

***

### stringCaptureStrategy?

> `optional` **stringCaptureStrategy**: `"conservative"` \| `"aggressive"`

Defined in: [types.ts:20](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/types.ts#L20)

Strategy for greedy string capture when standard JSON parsing fails.

- `'conservative'`: Stops at any text matching the `"key":` pattern.
- `'aggressive'` (default): Only stops if the key exists in the Schema and its following value type matches the expectations.
