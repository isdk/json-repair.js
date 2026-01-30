[**@isdk/json-repair**](../README.md)

***

[@isdk/json-repair](../globals.md) / RepairParser

# Class: RepairParser

Defined in: [parser.ts:8](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/parser.ts#L8)

A state-machine based parser that repairs and extracts structured data from broken JSON strings.
It uses a JSON Schema to guide the parsing process, especially for handling ambiguous or missing syntax.

## Constructors

### Constructor

> **new RepairParser**(`walker`, `options`): `RepairParser`

Defined in: [parser.ts:21](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/parser.ts#L21)

Creates a new RepairParser instance.

#### Parameters

##### walker

[`SchemaWalker`](SchemaWalker.md)

An initialized SchemaWalker instance for Schema guidance.

##### options

[`RepairOptions`](../interfaces/RepairOptions.md) = `{}`

Configuration options for the repair process.

#### Returns

`RepairParser`

## Methods

### parse()

> **parse**(`input`): `any`

Defined in: [parser.ts:35](https://github.com/isdk/json-repair.js/blob/51ba9c939ae687b9da4b8574f2af0af0f31a3c0e/src/parser.ts#L35)

Parses the input string and returns the repaired JavaScript object.

#### Parameters

##### input

`string`

The potentially broken JSON string.

#### Returns

`any`

The parsed and repaired object.
