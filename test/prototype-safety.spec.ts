import { describe, it, expect } from 'vitest'
import { jsonRepair, SchemaWalker } from '../src/index.js'

/**
 * Two side effects that must never happen while repairing:
 *
 * - the repaired document must not travel through the prototype chain. A key literally
 *   named `__proto__` is an ordinary own property for `JSON.parse`, but `obj[key] = value`
 *   hands it to the `Object.prototype.__proto__` setter, which silently drops the key and
 *   gives the result inherited properties.
 * - the Schema object the caller passed to `SchemaWalker.create()` must stay untouched,
 *   because `$RefParser.dereference()` replaces every `$ref` in place.
 */

describe('prototype-safe output', () => {
  it('keeps a `__proto__` key as an own data property', async () => {
    const text = '{"__proto__": {"polluted": 1}, "a": 1}'
    const result = await jsonRepair(text)

    expect(Object.keys(result)).toEqual(['__proto__', 'a'])
    expect(JSON.stringify(result)).toBe(JSON.stringify(JSON.parse(text)))
  })

  it('does not give the result inherited properties', async () => {
    const result = await jsonRepair('{"__proto__": {"polluted": 1}, "a": 1}')

    expect(result.polluted).toBeUndefined()
    expect(result['__proto__']).toEqual({ polluted: 1 })
    expect(({} as any).polluted).toBeUndefined()
  })

  it('handles other Object.prototype-shaped keys as plain data', async () => {
    const text =
      '{"constructor": "x", "toString": "y", "hasOwnProperty": "z", "a": 1}'

    expect(await jsonRepair(text)).toEqual(JSON.parse(text))
  })

  it('accepts prototype-shaped keys in a broken document too', async () => {
    const result = await jsonRepair('{ __proto__: junk, a: 1 }')

    expect(Object.keys(result)).toEqual(['__proto__', 'a'])
    expect(result.a).toBe(1)
  })
})

describe('SchemaWalker.create() leaves the caller Schema alone', () => {
  it('does not resolve $ref inside the object that was passed in', async () => {
    const schema = {
      type: 'object',
      definitions: { name: { type: 'string' } },
      properties: { name: { $ref: '#/definitions/name' } },
    }

    const walker = await SchemaWalker.create(schema)

    expect(schema.properties.name).toEqual({ $ref: '#/definitions/name' })
    expect(walker.getSchemaForPath(['name'])).toEqual({ type: 'string' })
  })

  it('does not rewrite a Schema that is reused for several walkers', async () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/definitions/item' },
        },
      },
      definitions: {
        item: { type: 'object', properties: { id: { type: 'number' } } },
      },
    }
    const snapshot = JSON.stringify(schema)

    await SchemaWalker.create(schema)

    expect(JSON.stringify(schema)).toBe(snapshot)
  })
})
