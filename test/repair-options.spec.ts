import { describe, it, expect } from 'vitest'
import { jsonRepair, SchemaWalker } from '../src/index.js'

/**
 * Behaviour of every documented `RepairOptions` switch.
 *
 * `keyMatching`, `additionalProperties` and `stringCaptureStrategy` used to be
 * declared in the typings without any effect in the parser (see the "Not Wired Up
 * Yet" note in the README). These tests define what they actually do:
 *
 * - `keyMatching` resolves an incoming key to the Schema's canonical property name
 *   and the *canonical* name is what ends up in the output and in the schema lookup
 *   path, so coercion of nested values keeps working.
 * - `additionalProperties: 'remove'` drops keys that the Schema does not declare at
 *   a level that *does* declare properties (a free-form object is never emptied).
 * - `stringCaptureStrategy: 'conservative'` makes greedy capture stop at any
 *   key-shaped token instead of only at Schema-declared keys.
 */

const userSchema = {
  type: 'object',
  properties: {
    userName: { type: 'string' },
    userAge: { type: 'number' },
    isActive: { type: 'boolean' },
    profile: {
      type: 'object',
      properties: {
        home_town: { type: 'string' },
        loginCount: { type: 'number' },
      },
    },
  },
}

describe('keyMatching', () => {
  it('is strict by default: an undeclared key is kept verbatim', async () => {
    const result = await jsonRepair(
      '{ user_name: "Ada", user_age: 36 }',
      userSchema
    )
    expect(result).toEqual({ user_name: 'Ada', user_age: 36 })
  })

  it('maps snake_case input keys onto camelCase Schema keys', async () => {
    const result = await jsonRepair(
      '{ user_name: "Ada", user_age: "36", is_active: "yes" }',
      userSchema,
      { keyMatching: true, coerceTypes: true }
    )
    expect(result).toEqual({ userName: 'Ada', userAge: 36, isActive: true })
  })

  it('matches case-insensitively', async () => {
    const result = await jsonRepair(
      '{ USERNAME: "Ada", userAGE: 36 }',
      userSchema,
      {
        keyMatching: true,
      }
    )
    expect(result).toEqual({ userName: 'Ada', userAge: 36 })
  })

  it('works in both directions (Schema snake_case, input camelCase)', async () => {
    const result = await jsonRepair(
      '{ profile: { homeTown: "Geneva", login_count: "7" } }',
      userSchema,
      { keyMatching: true, coerceTypes: true }
    )
    expect(result).toEqual({
      profile: { home_town: 'Geneva', loginCount: 7 },
    })
  })

  it('keeps the Schema name at nested levels so coercion still applies', async () => {
    const result = await jsonRepair(
      '{ profile: { logincOUNT: "7" } }',
      userSchema,
      { keyMatching: true, coerceTypes: true }
    )
    expect(result).toEqual({ profile: { loginCount: 7 } })
  })

  it('does not invent keys: a non-matching key stays as it was', async () => {
    const result = await jsonRepair(
      '{ user_name: "Ada", nothing_like_this: 1 }',
      userSchema,
      { keyMatching: true }
    )
    expect(result).toEqual({ userName: 'Ada', nothing_like_this: 1 })
  })

  it('accepts a custom matcher receiving (key, declaredProperties)', async () => {
    const schema = {
      type: 'object',
      properties: { totalAmount: { type: 'number' } },
    }
    const result = await jsonRepair('{ total: 42, other: 1 }', schema, {
      keyMatching: (key, properties) =>
        properties.find((p) => p.toLowerCase().startsWith(key.toLowerCase())),
    })
    expect(result).toEqual({ totalAmount: 42, other: 1 })
  })

  it('lets a custom matcher opt out by returning undefined', async () => {
    const result = await jsonRepair('{ user_name: "Ada" }', userSchema, {
      keyMatching: () => undefined,
    })
    expect(result).toEqual({ user_name: 'Ada' })
  })

  it('applies when the options were given to a reused SchemaWalker', async () => {
    const walker = await SchemaWalker.create(userSchema, { keyMatching: true })
    const first = await jsonRepair('{ user_name: "Ada" }', walker)
    const second = await jsonRepair('{ USER_AGE: 36 }', walker)
    expect(first).toEqual({ userName: 'Ada' })
    expect(second).toEqual({ userAge: 36 })
  })

  it('does not turn a valid JSON document into something else', async () => {
    const text = JSON.stringify(
      { userName: 'Ada', profile: { home_town: 'Geneva' } },
      null,
      2
    )
    const result = await jsonRepair(text, userSchema, { keyMatching: true })
    expect(result).toEqual(JSON.parse(text))
  })
})

describe('coerceTypes', () => {
  const schema = {
    type: 'object',
    properties: { userAge: { type: 'number' } },
  }

  it('is enabled by default', async () => {
    expect(await jsonRepair('{ userAge: "36" }', schema)).toEqual({
      userAge: 36,
    })
  })

  it('leaves the parsed value untouched when disabled', async () => {
    expect(
      await jsonRepair('{ userAge: "36" }', schema, { coerceTypes: false })
    ).toEqual({
      userAge: '36',
    })
  })
})

describe('additionalProperties', () => {
  it("keeps undeclared keys by default ('keep')", async () => {
    const result = await jsonRepair(
      '{ userName: "Ada", junk: { deep: 2 } }',
      userSchema
    )
    expect(result).toEqual({ userName: 'Ada', junk: { deep: 2 } })
  })

  it("drops keys the Schema does not declare with 'remove'", async () => {
    const result = await jsonRepair(
      '{ userName: "Ada", junk: { deep: 2 }, userAge: 36 }',
      userSchema,
      { additionalProperties: 'remove' }
    )
    expect(result).toEqual({ userName: 'Ada', userAge: 36 })
  })

  it("applies 'remove' at nested levels too", async () => {
    const result = await jsonRepair(
      '{ profile: { home_town: "Geneva", noise: true } }',
      userSchema,
      { additionalProperties: 'remove' }
    )
    expect(result).toEqual({ profile: { home_town: 'Geneva' } })
  })

  it("applies 'remove' inside arrays of objects", async () => {
    const schema = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'number' } } },
    }
    const result = await jsonRepair('[{ id: 1, note: "x" }]', schema, {
      additionalProperties: 'remove',
    })
    expect(result).toEqual([{ id: 1 }])
  })

  it('never empties a level whose Schema declares no properties', async () => {
    const result = await jsonRepair(
      '{ profile: { anything: 1 } }',
      { type: 'object', properties: { profile: { type: 'object' } } },
      { additionalProperties: 'remove' }
    )
    expect(result).toEqual({ profile: { anything: 1 } })
  })

  it('keeps a key that fuzzy-matched a declared property', async () => {
    const result = await jsonRepair(
      '{ user_name: "Ada", junk: 1 }',
      userSchema,
      {
        keyMatching: true,
        additionalProperties: 'remove',
      }
    )
    expect(result).toEqual({ userName: 'Ada' })
  })
})

describe('stringCaptureStrategy', () => {
  const captureSchema = {
    type: 'object',
    properties: {
      query: { type: 'string' },
      intent: { type: 'string' },
    },
  }
  const broken = '{ "query": he said "hello there": loudly, "intent": "x" }'

  it("'aggressive' (default) keeps text that only looks like a key", async () => {
    expect(await jsonRepair(broken, captureSchema)).toEqual({
      query: 'he said "hello there": loudly',
      intent: 'x',
    })
    expect(
      await jsonRepair(broken, captureSchema, {
        stringCaptureStrategy: 'aggressive',
      })
    ).toEqual({
      query: 'he said "hello there": loudly',
      intent: 'x',
    })
  })

  it("'conservative' stops greedy capture at any key-shaped token", async () => {
    const result = await jsonRepair(broken, captureSchema, {
      stringCaptureStrategy: 'conservative',
    })
    expect(result).toEqual({
      query: 'he said',
      'hello there': 'loudly',
      intent: 'x',
    })
  })

  it('does not break balanced DSL snippets in either strategy', async () => {
    const text = '{ query: @func(a="x, y"), intent: "z" }'
    const expected = { query: '@func(a="x, y")', intent: 'z' }
    expect(await jsonRepair(text, captureSchema)).toEqual(expected)
    expect(
      await jsonRepair(text, captureSchema, {
        stringCaptureStrategy: 'conservative',
      })
    ).toEqual(expected)
  })

  it('without declared properties both strategies agree', async () => {
    const text = '{ note: see "foo bar": baz here, b: 2 }'
    const expected = { note: 'see', 'foo bar': 'baz here', b: 2 }
    expect(await jsonRepair(text)).toEqual(expected)
    expect(
      await jsonRepair(text, undefined, {
        stringCaptureStrategy: 'conservative',
      })
    ).toEqual(expected)
  })
})
