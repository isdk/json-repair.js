[**@isdk/json-repair**](../README.md)

***

[@isdk/json-repair](../globals.md) / SchemaWalker

# Class: SchemaWalker

Defined in: [walker/schema-walker.ts:8](https://github.com/isdk/json-repair.js/blob/3f845b403701594c2cff6cea4e1759ad41923da5/src/walker/schema-walker.ts#L8)

Navigates through a JSON Schema based on a JSON Path.
Handles $ref resolution and provides type information for specific paths.

## Methods

### getExpectedTypes()

> **getExpectedTypes**(`path`, `key`): `string`[]

Defined in: [walker/schema-walker.ts:89](https://github.com/isdk/json-repair.js/blob/3f845b403701594c2cff6cea4e1759ad41923da5/src/walker/schema-walker.ts#L89)

Gets the expected types for a specific property at a given path.

#### Parameters

##### path

[`JSONPath`](../type-aliases/JSONPath.md)

The current parent path.

##### key

`string`

The property key.

#### Returns

`string`[]

An array of expected type strings (e.g., ["string", "number"]).

***

### getSchemaForPath()

> **getSchemaForPath**(`path`): `any`

Defined in: [walker/schema-walker.ts:37](https://github.com/isdk/json-repair.js/blob/3f845b403701594c2cff6cea4e1759ad41923da5/src/walker/schema-walker.ts#L37)

Retrieves the sub-schema for a given JSON path.

#### Parameters

##### path

[`JSONPath`](../type-aliases/JSONPath.md)

The path to navigate to.

#### Returns

`any`

The sub-schema at the specified path, or undefined if not found.

***

### isValidProperty()

> **isValidProperty**(`path`, `key`): `boolean`

Defined in: [walker/schema-walker.ts:64](https://github.com/isdk/json-repair.js/blob/3f845b403701594c2cff6cea4e1759ad41923da5/src/walker/schema-walker.ts#L64)

Determines if a property key is valid for the given path according to the Schema.

#### Parameters

##### path

[`JSONPath`](../type-aliases/JSONPath.md)

The current parent path.

##### key

`string`

The property key to check.

#### Returns

`boolean`

True if the property is defined in the Schema or allowed by additionalProperties.

***

### create()

> `static` **create**(`schema`): `Promise`\<`SchemaWalker`\>

Defined in: [walker/schema-walker.ts:22](https://github.com/isdk/json-repair.js/blob/3f845b403701594c2cff6cea4e1759ad41923da5/src/walker/schema-walker.ts#L22)

Static factory method to create a SchemaWalker instance.
Asynchronously dereferences the provided JSON Schema.

#### Parameters

##### schema

`any`

The JSON Schema object to walk.

#### Returns

`Promise`\<`SchemaWalker`\>

A promise that resolves to a SchemaWalker instance.
