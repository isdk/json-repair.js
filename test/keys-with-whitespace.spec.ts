import { describe, it, expect } from 'vitest'
import { jsonRepair } from '../src/index.js'

/**
 * Regression suite for quoted object keys that contain whitespace.
 *
 * Reported symptom:
 *   `{\n  "Capital": "Berlin",\n  "Official language": "Italian"\n}`
 *   -> { "Capital": "\"Berlin\",\n  \"Official", "language\"": "Italian" }
 *
 * Root cause (as of 0.1.2): `RepairParser.isLookingAtKey()` uses the regex
 * /^\s*["']?([^"'\s:]+)["']?\s*:/, which cannot match a quoted key containing a
 * space. So the "the next property starts here" boundary is never seen,
 * `isAtDelimiter()` rejects an already-successful strict parse, and the parser
 * falls back to greedy capture, which swallows the comma and half of the next key.
 */

const countrySchema = {
  type: 'object',
  properties: {
    Capital: { type: 'string' },
    'Official language': { type: 'string' },
  },
}

/** Guard: a repaired object must never contain keys mangled by a split quoted key. */
function assertSaneKeys(result: any, path = '$') {
  if (Array.isArray(result)) {
    result.forEach((v, i) => assertSaneKeys(v, `${path}[${i}]`))
    return
  }
  if (result && typeof result === 'object') {
    for (const [key, value] of Object.entries(result)) {
      expect(
        key,
        `unbalanced quote in key at ${path}: ${JSON.stringify(key)}`
      ).not.toMatch(/["']/)
      assertSaneKeys(value, `${path}.${key}`)
    }
  }
}

describe('reported bug: quoted key containing a space', () => {
  const multiline = `{\n  "Capital": "Berlin",\n  "Official language": "Italian"\n}`
  const singleline = `{"Capital": "Berlin", "Official language": "Italian"}`
  const expected = { Capital: 'Berlin', 'Official language': 'Italian' }

  it('parses the multiline form without a schema', async () => {
    const result = await jsonRepair(multiline)
    expect(result).toEqual(expected)
    assertSaneKeys(result)
  })

  it('parses the multiline form with a matching schema', async () => {
    const result = await jsonRepair(multiline, countrySchema)
    expect(result).toEqual(expected)
    assertSaneKeys(result)
  })

  it('parses the single-line form without a schema', async () => {
    expect(await jsonRepair(singleline)).toEqual(expected)
  })

  it('parses the single-line form with a matching schema', async () => {
    expect(await jsonRepair(singleline, countrySchema)).toEqual(expected)
  })

  it('parses when the spaced key comes first', async () => {
    expect(
      await jsonRepair(`{"Official language": "Italian", "Capital": "Berlin"}`)
    ).toEqual(expected)
  })

  it('parses when every key contains a space', async () => {
    expect(
      await jsonRepair(
        `{"Official language": "Italian", "Capital city": "Berlin"}`
      )
    ).toEqual({
      'Official language': 'Italian',
      'Capital city': 'Berlin',
    })
  })
})

describe('JSON.parse parity: valid JSON must survive untouched', () => {
  const docs: [string, any][] = [
    [`{"a": 1, "b c": 2}`, { a: 1, 'b c': 2 }],
    [
      `{"note": "a, b", "Official language": "Italian"}`,
      { note: 'a, b', 'Official language': 'Italian' },
    ],
    [
      `{"a": "x", "b c": true, "d e": null, "f g": 1.5}`,
      { a: 'x', 'b c': true, 'd e': null, 'f g': 1.5 },
    ],
    [
      `{"outer key": { "inner key": 1 }, "b": 2}`,
      { 'outer key': { 'inner key': 1 }, b: 2 },
    ],
    [
      `[{"a b": 1, "c d": 2}, {"a b": 3, "c d": 4}]`,
      [
        { 'a b': 1, 'c d': 2 },
        { 'a b': 3, 'c d': 4 },
      ],
    ],
    [
      `{"deep": {"a": [{"b c": [1, "x y", true, null]}]}}`,
      { deep: { a: [{ 'b c': [1, 'x y', true, null] }] } },
    ],
    [`{"城市 名称": "北京", "人口": 1}`, { '城市 名称': '北京', 人口: 1 }],
    [`{"a, b": 1, "c": 2}`, { 'a, b': 1, c: 2 }],
    [`{"a: b": 1, "c": 2}`, { 'a: b': 1, c: 2 }],
    [`{"a\\"b": 1, "c": 2}`, { 'a"b': 1, c: 2 }],
    [
      `{" Official language ": "Italian", "c": 2}`,
      { ' Official language ': 'Italian', c: 2 },
    ],
  ]

  // Note: no assertSaneKeys() here — some fixtures legitimately contain quotes or
  // commas inside the key, so deep equality against the exact expected object is the assertion.
  it.each(docs)('without schema: %s', async (input, expected) => {
    expect(JSON.parse(input)).toEqual(expected)
    expect(await jsonRepair(input)).toEqual(expected)
  })

  it.each(docs)('with a derived schema: %s', async (input, expected) => {
    expect(await jsonRepair(input, deriveSchema(expected))).toEqual(expected)
  })
})

function deriveSchema(value: any): any {
  if (Array.isArray(value))
    return { type: 'array', items: value.length ? deriveSchema(value[0]) : {} }
  if (value === null) return { type: 'null' }
  if (typeof value === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, deriveSchema(v)])
      ),
    }
  }
  return { type: typeof value }
}

describe('spaced keys inside broken JSON', () => {
  it('single-quoted keys and values', async () => {
    const result = await jsonRepair(
      `{'Capital': 'Berlin', 'Official language': 'Italian'}`
    )
    expect(result).toEqual({
      Capital: 'Berlin',
      'Official language': 'Italian',
    })
    assertSaneKeys(result)
  })

  it('unclosed object', async () => {
    const result = await jsonRepair(
      `{\n  "Capital": "Berlin",\n  "Official language": "Italian"`
    )
    expect(result).toEqual({
      Capital: 'Berlin',
      'Official language': 'Italian',
    })
    assertSaneKeys(result)
  })

  it('trailing comma', async () => {
    const result = await jsonRepair(
      `{"Capital": "Berlin", "Official language": "Italian",}`
    )
    expect(result).toEqual({
      Capital: 'Berlin',
      'Official language': 'Italian',
    })
  })

  it('missing comma between pairs', async () => {
    const result = await jsonRepair(`{ "a b": 1 "c d": 2 }`)
    expect(result).toEqual({ 'a b': 1, 'c d': 2 })
    assertSaneKeys(result)
  })

  it('numbers followed by a spaced key keep their type', async () => {
    const result = await jsonRepair(`{ a: 1, "b c": 2 }`)
    expect(result).toEqual({ a: 1, 'b c': 2 })
    assertSaneKeys(result)
  })

  it('unquoted value followed by a spaced key', async () => {
    const result = await jsonRepair(
      `{ query: some words, "official name": x }`,
      {
        type: 'object',
        properties: {
          query: { type: 'string' },
          'official name': { type: 'string' },
        },
      }
    )
    expect(result).toEqual({ query: 'some words', 'official name': 'x' })
    assertSaneKeys(result)
  })

  it('implicit root object made of spaced keys (schema-guided)', async () => {
    const result = await jsonRepair(`"a b": 1, "c d": 2`, {
      type: 'object',
      properties: { 'a b': { type: 'number' }, 'c d': { type: 'number' } },
    })
    expect(result).toEqual({ 'a b': 1, 'c d': 2 })
    assertSaneKeys(result)
  })

  it('spaced keys inside an array of objects, unclosed at the end', async () => {
    const result = await jsonRepair(
      `{"users": [ {"name a": "Ann", "id b": 1}, {"name a": "Bob", "id b": 2}`
    )
    expect(result).toEqual({
      users: [
        { 'name a': 'Ann', 'id b': 1 },
        { 'name a': 'Bob', 'id b': 2 },
      ],
    })
    assertSaneKeys(result)
  })

  it('empty string key', async () => {
    const result = await jsonRepair(`{"": "empty key", "b": 1}`)
    expect(result).toEqual({ '': 'empty key', b: 1 })
  })
})

describe('schema-guided behaviour with spaced keys', () => {
  it('coerces a value addressed through a spaced key path', async () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' }, 'total count': { type: 'number' } },
    }
    const result = await jsonRepair(`{"a": "x", "total count": "5 个"}`, schema)
    expect(result).toEqual({ a: 'x', 'total count': 5 })
    assertSaneKeys(result)
  })

  it('declared spaced key inside strict additionalProperties:false', async () => {
    const schema = { ...countrySchema, additionalProperties: false }
    const result = await jsonRepair(
      `{"Capital": "Berlin", "Official language": "Italian"}`,
      schema
    )
    expect(result).toEqual({
      Capital: 'Berlin',
      'Official language': 'Italian',
    })
    assertSaneKeys(result)
  })

  it('undeclared spaced key inside strict additionalProperties:false must not be swallowed', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { Capital: { type: 'string' } },
    }
    const result = await jsonRepair(
      `{"Capital": "Berlin", "Official language": "Italian"}`,
      schema
    )
    // The value of Capital must stay clean; the unknown key may be kept or dropped,
    // but it must never be glued onto the previous value.
    expect(result.Capital).toBe('Berlin')
    assertSaneKeys(result)
  })

  it('array items schema with spaced keys', async () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', properties: { 'a b': { type: 'number' } } },
        },
      },
    }
    const result = await jsonRepair(
      `{"items": [{"a b": "1个", "z": 2}]}`,
      schema
    )
    expect(result).toEqual({ items: [{ 'a b': 1, z: 2 }] })
    assertSaneKeys(result)
  })
})

describe('greedy capture must keep working (regression guards)', () => {
  it('OR expression: quoted fragments not followed by a colon stay in the value', async () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string' }, intent: { type: 'string' } },
    }
    const input = `{ 
      query: "python quicksort" OR "Python 快速排序", 
      intent: 用户在寻找python语言的快速排序 
    }`
    const result = await jsonRepair(input, schema)
    expect(result).toEqual({
      query: '"python quicksort" OR "Python 快速排序"',
      intent: '用户在寻找python语言的快速排序',
    })
  })

  it('DSL-like strings with balanced delimiters and commas', async () => {
    const result = await jsonRepair(
      `[ @weather(location="上海, 中国", date="today") ]`,
      {
        type: 'array',
        items: { type: 'string' },
      }
    )
    expect(result).toEqual(['@weather(location="上海, 中国", date="today")'])
  })

  it('unquoted multi-word value before a normal key', async () => {
    const result = await jsonRepair(`{ name: John Smith MD, age: 30 }`, {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
    })
    expect(result).toEqual({ name: 'John Smith MD', age: 30 })
  })

  it('greedy capture stops at a declared schema key, not at text that merely looks like one', async () => {
    const schema = {
      type: 'object',
      properties: { note: { type: 'string' }, b: { type: 'number' } },
    }
    const result = await jsonRepair(
      `{ "note": see "foo bar": baz here, "b": 2 }`,
      schema
    )
    expect(result).toEqual({ note: 'see "foo bar": baz here', b: 2 })
    assertSaneKeys(result)
  })

  it('documented limitation: without declared properties, key-shaped text becomes a property', async () => {
    // No Schema property names exist at this level, so the parser falls back to
    // "the first key-shaped token ends the value". See README - Thinking about the heuristic.
    const result = await jsonRepair(
      `{ "note": see "foo bar": baz here, "b": 2 }`
    )
    expect(result).toEqual({ note: 'see', 'foo bar': 'baz here', b: 2 })
  })

  it('unescaped quotes inside a value do not consume the rest of the document', async () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string' }, intent: { type: 'string' } },
    }
    const result = await jsonRepair(
      `{ "query": he said "hello there": loudly, "intent": "x" }`,
      schema
    )
    expect(result).toEqual({
      query: 'he said "hello there": loudly',
      intent: 'x',
    })
    assertSaneKeys(result)
  })
})
