import { describe, it, expect } from 'vitest'
import { jsonRepair } from '../src/index.js'

/**
 * Number literals must survive as numbers, including the forms that are legal in JSON
 * but were not recognized by `RepairParser.consumeNumber()` (scientific notation,
 * a leading `+`, and a bare fraction like `.5`).
 */
describe('number literals: JSON.parse parity', () => {
  const docs: [string, any][] = [
    [`{"a": 1e5}`, { a: 100000 }],
    [`{"a": 1.5e-3, "b": -2E2}`, { a: 0.0015, b: -200 }],
    [`{"a": 1E+2}`, { a: 100 }],
    [
      `{"a": 0.0, "b": -0, "c": 100, "d": 0.5}`,
      { a: 0, b: -0, c: 100, d: 0.5 },
    ],
    [`{"a": [1e-7, 3E+2, -1.5]}`, { a: [1e-7, 300, -1.5] }],
    [`{"a": {"b": 2e3}}`, { a: { b: 2000 } }],
    [`{"a": 12345678901234567890}`, { a: 12345678901234567890 }],
    [`{"big 1": 1e5, "big 2": 2.5e2}`, { 'big 1': 100000, 'big 2': 250 }],
  ]

  it.each(docs)('without schema: %s', async (input, expected) => {
    expect(JSON.parse(input)).toEqual(expected)
    expect(await jsonRepair(input)).toEqual(expected)
  })

  it.each(docs)('with a number schema: %s', async (input, expected) => {
    const result = await jsonRepair(input, {
      type: 'object',
      additionalProperties: { type: 'number' },
    })
    expect(result).toEqual(expected)
    for (const leaf of leaves(result)) {
      expect(
        typeof leaf,
        `expected a number, got ${JSON.stringify(leaf)}`
      ).toBe('number')
    }
  })

  function leaves(value: any): any[] {
    if (Array.isArray(value)) return value.flatMap(leaves)
    if (value && typeof value === 'object')
      return Object.values(value).flatMap(leaves)
    return [value]
  }
})

describe('number literals: non-standard but LLM-typical forms', () => {
  const numberSchema = {
    type: 'object',
    properties: { a: { type: 'number' } },
  }

  it('accepts a leading plus sign', async () => {
    expect(await jsonRepair('{ a: +5 }', numberSchema)).toEqual({ a: 5 })
  })

  it('accepts a bare fraction', async () => {
    expect(await jsonRepair('{ a: .5 }', numberSchema)).toEqual({ a: 0.5 })
    expect(await jsonRepair('{ a: -.5 }', numberSchema)).toEqual({ a: -0.5 })
  })

  it('accepts a trailing decimal point', async () => {
    expect(await jsonRepair('{ a: 5. }', numberSchema)).toEqual({ a: 5 })
  })

  it('keeps exponent values inside arrays', async () => {
    expect(await jsonRepair('{ a: [1e2, 2, 3.5] }', numberSchema)).toEqual({
      a: [100, 2, 3.5],
    })
  })

  it('does not treat the letter after a bare digit as part of the number', async () => {
    // `1e` is not a valid literal; the value must fall back to greedy capture
    // and then be coerced by the Schema rather than silently truncating the input.
    expect(await jsonRepair('{ a: 1e }', numberSchema)).toEqual({ a: 1 })
  })

  it('still prefers the string value when a number cannot be extracted', async () => {
    expect(await jsonRepair('{ a: unknown_id }', numberSchema)).toEqual({
      a: 'unknown_id',
    })
  })

  it('keeps noisy-number coercion working', async () => {
    const schema = { type: 'object', properties: { price: { type: 'number' } } }
    expect(await jsonRepair('{ price: "约 1,200.50 元" }', schema)).toEqual({
      price: 1200.5,
    })
  })

  it('does not split a word that merely starts with digits', async () => {
    expect(
      await jsonRepair('{ a: 1.2.3, b: x }', {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
      })
    ).toEqual({ a: '1.2.3', b: 'x' })
  })
})
