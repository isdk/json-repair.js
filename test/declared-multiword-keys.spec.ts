import { describe, it, expect } from 'vitest'
import { jsonRepair, SchemaWalker, RepairParser } from '../src/index.js'

/**
 * Schema-declared property keys that contain whitespace, found **unquoted** in the document.
 *
 * Reported symptom:
 *   schema declares `"Official language"`
 *   `{ Capital: Berlin, Official language: Italian }`
 *     -> { "Capital": "Berlin, Official language: Italian" }   // the rest of the document is swallowed
 *
 * Root cause: `RepairParser.matchKey()` can only span whitespace inside its *quoted* branch
 * (`([^\s"',:{}\[\]]+)` excludes whitespace), and `consumeKey()` stops a bare key at the first
 * space. So the text `Official language:` never reads as one key: the parser only sees
 * `Official` (no colon after it -> not a key) and `language` (key-shaped, but not declared ->
 * not a breakpoint in aggressive mode). `keyMatching` cannot rescue it either, because
 * `isBoundaryAhead()` compares against `isDeclaredProperty()` (exact names) instead of
 * `matchProperty()`.
 *
 * The contract these tests pin: **a property name declared by the Schema is a breakpoint at its
 * literal position**, even when the document left it unquoted and it contains spaces. That is the
 * same principle the README already states ("declaring `properties` makes declared keys act as
 * breakpoints for greedy capture"), just applied to multi-word names.
 */

const countrySchema = {
  type: 'object',
  properties: {
    Capital: { type: 'string' },
    'Official language': { type: 'string' },
  },
}

const expected = { Capital: 'Berlin', 'Official language': 'Italian' }

/** A repaired object must never carry a key that is a fragment of a spaced key. */
function assertNoKeyFragments(result: any) {
  for (const key of Object.keys(result)) {
    expect(key).not.toBe('language')
    expect(key).not.toBe('Official')
  }
}

describe('unquoted key containing a space, declared by the Schema', () => {
  const fixtures: [string, string][] = [
    [
      'single line, unquoted keys and values',
      `{ Capital: Berlin, Official language: Italian }`,
    ],
    ['multiline', `{\n  Capital: Berlin,\n  Official language: Italian\n}`],
    [
      'unquoted key after a quoted value',
      `{ "Capital": "Berlin", Official language: Italian }`,
    ],
    [
      'unquoted key before a quoted value',
      `{ Capital: Berlin, Official language: "Italian" }`,
    ],
    [
      'no comma between the pairs',
      `{ Capital: Berlin, Official language: Italian`,
    ],
    [
      'implicit root object (no braces)',
      `Capital: Berlin, Official language: Italian`,
    ],
    [
      'extra whitespace inside the spaced key',
      `{ Capital: Berlin, Official   language: Italian }`,
    ],
    [
      'missing comma between the pairs',
      `{ Capital: Berlin Official language: Italian }`,
    ],
  ]

  it.each(fixtures)('%s', async (_label, input) => {
    const result = await jsonRepair(input, countrySchema)
    expect(result).toEqual(expected)
    assertNoKeyFragments(result)
  })

  it('nested inside another declared object', async () => {
    const schema = {
      type: 'object',
      properties: { country: countrySchema },
    }
    expect(
      await jsonRepair(
        `{ country: { Capital: Berlin, Official language: Italian } }`,
        schema
      )
    ).toEqual({ country: expected })
  })

  it('inside an array of objects, unclosed at the end', async () => {
    const schema = {
      type: 'object',
      properties: { countries: { type: 'array', items: countrySchema } },
    }
    expect(
      await jsonRepair(
        `{ countries: [ { Capital: Berlin, Official language: German }, { Capital: Rome, Official language: Italian } ]`,
        schema
      )
    ).toEqual({
      countries: [
        { Capital: 'Berlin', 'Official language': 'German' },
        { Capital: 'Rome', 'Official language': 'Italian' },
      ],
    })
  })

  it('the spaced key may come first', async () => {
    expect(
      await jsonRepair(
        `{ Official language: Italian, Capital: Berlin }`,
        countrySchema
      )
    ).toEqual(expected)
  })

  it('the Schema path is used for coercion of the value behind the spaced key', async () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' }, 'total count': { type: 'number' } },
    }
    expect(await jsonRepair(`{ a: x, total count: 5 个 }`, schema)).toEqual({
      a: 'x',
      'total count': 5,
    })
  })

  it('works through a reused SchemaWalker', async () => {
    const walker = await SchemaWalker.create(countrySchema)
    expect(
      await jsonRepair(
        `{ Capital: Berlin, Official language: Italian }`,
        walker
      )
    ).toEqual(expected)
  })

  it('a reused RepairParser does not carry declarations across levels between parses', async () => {
    // The per-level declaration memo has to be reset by parse(); otherwise a following document
    // would look the multi-word name up on the wrong Schema level.
    const walker = await SchemaWalker.create({
      type: 'object',
      properties: {
        a: { type: 'object', properties: { 'x y': { type: 'string' } } },
        'p q': { type: 'string' },
      },
    })
    const parser = new RepairParser(walker)
    expect(parser.parse(`{ a: { x y: first } }`)).toEqual({
      a: { 'x y': 'first' },
    })
    expect(parser.parse(`{ p q: second }`)).toEqual({ 'p q': 'second' })
  })

  it('is not sensitive to additionalProperties: remove', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, Official language: Italian }`,
        countrySchema,
        {
          additionalProperties: 'remove',
        }
      )
    ).toEqual(expected)
  })
})

describe('breakpoints honour keyMatching', () => {
  it('a separator variant of a declared key breaks capture and is renamed', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, official_language: Italian }`,
        countrySchema,
        {
          keyMatching: true,
        }
      )
    ).toEqual(expected)
  })

  it('a case variant of a declared spaced key matches when keyMatching is on', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, official language: Italian }`,
        countrySchema,
        {
          keyMatching: true,
        }
      )
    ).toEqual(expected)
  })

  it('a case variant is not a breakpoint without keyMatching', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, official language: Italian }`,
        countrySchema
      )
    ).toEqual({ Capital: 'Berlin, official language: Italian' })
  })

  it('the camelCase variant of a declared spaced key is renamed too', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, OfficialLanguage: Italian }`,
        countrySchema,
        {
          keyMatching: true,
        }
      )
    ).toEqual(expected)
  })

  it('without keyMatching the exact declaration still matches', async () => {
    const schema = {
      type: 'object',
      properties: {
        Capital: { type: 'string' },
        Official_language: { type: 'string' },
      },
    }
    expect(
      await jsonRepair(
        `{ Capital: Berlin, official_language: Italian }`,
        schema
      )
    ).toEqual({
      Capital: 'Berlin, official_language: Italian',
    })
  })
})

describe('stringCaptureStrategy stays orthogonal', () => {
  it('conservative mode produces the same result for a declared spaced key', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, Official language: Italian }`,
        countrySchema,
        {
          stringCaptureStrategy: 'conservative',
        }
      )
    ).toEqual(expected)
  })

  it('conservative mode still cuts values at undeclared key-shaped text', async () => {
    expect(
      await jsonRepair(
        `{ note: see "foo bar": baz here, b: 2 }`,
        countrySchema,
        {
          stringCaptureStrategy: 'conservative',
        }
      )
    ).toEqual({ note: 'see', 'foo bar': 'baz here', b: 2 })
  })
})

describe('the breakpoint is the declared name, not any multi-word text', () => {
  const proseSchema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      'Official language': { type: 'string' },
    },
  }

  it('a declared name without a following colon stays inside the value', async () => {
    expect(
      await jsonRepair(
        `{ summary: the Official language is Italian, Official language: Italian }`,
        proseSchema
      )
    ).toEqual({
      summary: 'the Official language is Italian',
      'Official language': 'Italian',
    })
  })

  it('a declared name glued to a longer word does not create a breakpoint', async () => {
    expect(
      await jsonRepair(
        `{ summary: de-factoOfficial language x, Official language: Italian }`,
        proseSchema
      )
    ).toEqual({
      summary: 'de-factoOfficial language x',
      'Official language': 'Italian',
    })
  })

  it('documented tradeoff: prose that itself looks like the declared key is cut there', async () => {
    expect(
      await jsonRepair(
        `{ summary: the Official language: Italian is wrong, Official language: Italian }`,
        proseSchema
      )
    ).toEqual({ summary: 'the', 'Official language': 'Italian' })
  })

  it('documented limitation: an undeclared unquoted spaced key is not a breakpoint', async () => {
    // Only names the Schema declares can act as a multi-word breakpoint. `Lang` is not one of
    // them, so aggressive greedy capture (the default) keeps the whole text as one value.
    expect(
      await jsonRepair(
        `{ Capital: Berlin, Official Lang: Italian }`,
        countrySchema
      )
    ).toEqual({ Capital: 'Berlin, Official Lang: Italian' })
  })

  it('an undeclared unquoted spaced key splits at the space in conservative mode', async () => {
    expect(
      await jsonRepair(
        `{ Capital: Berlin, Official Lang: Italian }`,
        countrySchema,
        {
          stringCaptureStrategy: 'conservative',
        }
      )
    ).toEqual({ Capital: 'Berlin, Official', Lang: 'Italian' })
  })

  it('a declared multi-word key of a nested level is not a breakpoint at the parent level', async () => {
    // The literal breakpoint is looked up on the Schema level that owns the value, so a key
    // declared deeper in the Schema cannot cut a value that belongs to its parent.
    const schema = {
      type: 'object',
      properties: {
        note: { type: 'string' },
        inner: {
          type: 'object',
          properties: { 'a b': { type: 'number' } },
        },
      },
    }
    expect(await jsonRepair(`{ note: text a b: 1 }`, schema)).toEqual({
      note: 'text a b: 1',
    })
    expect(
      await jsonRepair(`{ note: x, inner: { a b: "1 个" } }`, schema)
    ).toEqual({ note: 'x', inner: { 'a b': 1 } })
  })
})

describe('no regressions for the documented boundary rules', () => {
  it('JSON.parse parity is kept', async () => {
    const doc = `{ "Capital": "Berlin", "Official language": "Italian" }`
    expect(await jsonRepair(doc, countrySchema)).toEqual(JSON.parse(doc))
  })

  it('multi-word unquoted values before a normal key are kept', async () => {
    expect(
      await jsonRepair(`{ name: John Smith MD, age: 30 }`, {
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
      })
    ).toEqual({ name: 'John Smith MD', age: 30 })
  })

  it('greedy capture stops at a declared key, not at text that merely looks like one', async () => {
    expect(
      await jsonRepair(`{ "note": see "foo bar": baz here, "b": 2 }`, {
        type: 'object',
        properties: { note: { type: 'string' }, b: { type: 'number' } },
      })
    ).toEqual({ note: 'see "foo bar": baz here', b: 2 })
  })

  it('a value without schema guidance is untouched by the new rule', async () => {
    expect(
      await jsonRepair(`{ Capital: Berlin, Official language: Italian }`)
    ).toEqual({
      Capital: 'Berlin, Official',
      language: 'Italian',
    })
  })

  it('OR expressions and DSL snippets survive', async () => {
    expect(
      await jsonRepair(`[ @weather(location="上海, 中国", date="today") ]`, {
        type: 'array',
        items: { type: 'string' },
      })
    ).toEqual(['@weather(location="上海, 中国", date="today")'])
  })
})
