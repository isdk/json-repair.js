import { SchemaWalker } from './walker/index.js'
import { RepairOptions, JSONPath } from './types.js'

/**
 * A state-machine based parser that repairs and extracts structured data from broken JSON strings.
 * It uses a JSON Schema to guide the parsing process, especially for handling ambiguous or missing syntax.
 */
export class RepairParser {
  private input: string = ''
  private pos: number = 0
  private pathStack: JSONPath = []
  private walker: SchemaWalker
  private options: RepairOptions

  /**
   * Creates a new RepairParser instance.
   *
   * @param walker - An initialized SchemaWalker instance for Schema guidance.
   * @param options - Configuration options for the repair process.
   */
  constructor(walker: SchemaWalker, options: RepairOptions = {}) {
    this.walker = walker
    this.options = {
      coerceTypes: true,
      ...options,
    }
  }

  /**
   * Parses the input string and returns the repaired JavaScript object.
   *
   * @param input - The potentially broken JSON string.
   * @returns The parsed and repaired object.
   */
  parse(input: string): any {
    this.input = input.trim()
    this.pos = 0
    this.pathStack = []
    return this.consumeValue()
  }

  /**
   * Consumes a single value from the input.
   * Uses Schema guidance to decide whether to use standard parsing or greedy capture.
   */
  private consumeValue(): any {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return undefined

    const char = this.peek()
    const currentSchema = this.walker.getSchemaForPath(this.pathStack)
    const expectedType = currentSchema?.type

    // 1. Structured types (supports implicit objects)
    if (
      char === '{' ||
      (expectedType === 'object' && this.isLookingAtKey(this.pathStack))
    ) {
      return this.consumeObject()
    }
    if (char === '[') {
      return this.consumeArray()
    }

    const startPos = this.pos

    // 2. Try the strict (standard JSON) path for scalars.
    const strict = this.tryConsumeStrictValue(char)
    if (strict.ok) {
      if (this.options.coerceTypes && currentSchema) {
        return this.coerceValue(strict.value, currentSchema)
      }
      return strict.value
    }

    // 3. Fallback to Greedy Capture
    this.pos = startPos
    const rawValue = this.consumeGreedyString()

    if (this.options.coerceTypes && currentSchema) {
      return this.coerceValue(rawValue, currentSchema)
    }

    return rawValue
  }

  /**
   * Attempts a strict JSON scalar parse (string / number / boolean / null) at the current
   * position and rewinds when the token is not followed by a boundary.
   *
   * The boundary test runs in `'structural'` mode: a cleanly parsed value is trusted, so
   * anything that looks like the next key is treated as structure and the successful parse
   * is never discarded in favour of greedy capture. This is what guarantees that valid JSON
   * always parses exactly like `JSON.parse`.
   */
  private tryConsumeStrictValue(char: string): { ok: boolean; value: any } {
    const startPos = this.pos

    let parse: (() => any) | null = null
    if (char === '"' || char === "'") {
      parse = () => this.consumeString()
    } else if (this.isDigit(char) || char === '-' || char === '+') {
      parse = () => this.consumeNumber()
    } else if (char === 't' || char === 'f' || char === 'n') {
      parse = () => (char === 'n' ? this.consumeNull() : this.consumeBoolean())
    }
    if (!parse) return { ok: false, value: undefined }

    try {
      const value = parse()
      this.skipWhitespace()
      if (this.isAtDelimiter('structural') || this.pos >= this.input.length) {
        return { ok: true, value }
      }
    } catch (e) {
      // Malformed token: fall back to greedy capture.
    }

    this.pos = startPos
    return { ok: false, value: undefined }
  }

  /**
   * Parses a JSON object, handling both standard and implicit (no braces) structures.
   */
  private consumeObject(): any {
    const obj: any = {}
    const hasBraces = this.peek() === '{'
    if (hasBraces) this.consumeChar('{')
    this.skipWhitespace()

    while (this.pos < this.input.length && this.peek() !== '}') {
      const lastPos = this.pos
      if (
        !hasBraces &&
        (this.peek() === ']' ||
          (this.peek() === ',' &&
            !this.isLookingAtKey(this.pathStack.slice(0, -1), this.pos + 1)))
      ) {
        break
      }

      const key = this.consumeKey()
      if (key === null) break

      // Map the incoming key onto the name declared by the Schema when `keyMatching`
      // allows it. The canonical name is what ends up in the output and in the path used
      // for nested Schema lookups, so coercion of nested values keeps working.
      // At this point `pathStack` is exactly the parent path: the current key is only
      // pushed once its value is being parsed.
      const parentPath = [...this.pathStack]
      const property = this.walker.matchProperty(parentPath, key) ?? key

      // Handle duplicate keys in implicit objects within an array context
      if (!hasBraces && Object.prototype.hasOwnProperty.call(obj, property)) {
        this.pos = lastPos
        break
      }

      this.skipWhitespace()
      if (this.peek() === ':') this.consumeChar(':')

      this.pathStack.push(property)
      try {
        const val = this.consumeValue()
        if (this.pos !== lastPos || (val !== undefined && val !== '')) {
          if (this.isKeptProperty(parentPath, property)) {
            RepairParser.setOwn(obj, property, val)
          }
        }
      } finally {
        this.pathStack.pop()
      }

      this.skipWhitespace()
      if (this.peek() === ',') {
        const nextIsKey = this.isLookingAtKey(this.pathStack, this.pos + 1)
        if (
          nextIsKey ||
          (hasBraces && /^\s*[}]/.test(this.input.slice(this.pos + 1)))
        ) {
          this.consumeChar(',')
          this.skipWhitespace()
        } else if (!hasBraces) {
          break
        } else {
          this.consumeChar(',')
          this.skipWhitespace()
        }
      } else if (this.peek() !== '}' && this.isLookingAtKey(this.pathStack)) {
        this.skipWhitespace()
      }

      if (this.pos === lastPos) break
    }
    if (hasBraces && this.peek() === '}') this.consumeChar('}')
    return obj
  }

  /**
   * Whether a property belongs in the output, according to `RepairOptions.additionalProperties`.
   *
   * `'remove'` only drops keys at a level whose Schema declares property names: a level
   * that is free-form (`type: 'object'` without `properties`, or no Schema at all) has no
   * notion of an "extra" key, so dropping everything there would be destructive.
   */
  private isKeptProperty(parent: JSONPath, property: string): boolean {
    if (this.options.additionalProperties !== 'remove') return true
    if (!this.walker.hasDeclaredProperties(parent)) return true
    return this.walker.isDeclaredProperty(parent, property)
  }

  /**
   * Assigns an own enumerable property without going through setters.
   *
   * `obj[key] = value` with a key such as `__proto__` rewrites the prototype of the result
   * instead of storing a value (`JSON.parse` keeps it as a plain data property), which both
   * loses the key and leaks inherited properties into the repaired document.
   */
  private static setOwn(target: any, key: string, value: any): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }

  /**
   * Parses a JSON array.
   */
  private consumeArray(): any[] {
    const arr: any[] = []
    this.consumeChar('[')
    this.skipWhitespace()

    let index = 0
    while (this.pos < this.input.length && this.peek() !== ']') {
      if (this.peek() === '}') break
      const lastPos = this.pos
      this.pathStack.push(index)
      try {
        const val = this.consumeValue()
        if (this.pos !== lastPos) {
          arr.push(val)
          index++
        }
      } finally {
        this.pathStack.pop()
      }
      this.skipWhitespace()
      if (this.peek() === ',') {
        this.consumeChar(',')
        this.skipWhitespace()
      }
      if (this.pos === lastPos) break
    }
    if (this.peek() === ']') this.consumeChar(']')
    return arr
  }

  /**
   * Consumes a property key, handling both quoted and unquoted keys.
   *
   * A quoted key keeps its exact content, including whitespace and punctuation
   * (`"Official language"`); a bare key stops at quote characters so that a malformed
   * document can never produce keys such as `language"`.
   *
   * @returns the key, or `null` when no key is present at all (an empty quoted key `""`
   * is a valid key and returns the empty string).
   */
  private consumeKey(): string | null {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return null
    if (this.peek() === '"' || this.peek() === "'") return this.consumeString()

    let key = ''
    while (
      this.pos < this.input.length &&
      !this.isWhitespace(this.peek()) &&
      this.peek() !== ':' &&
      this.peek() !== ',' &&
      this.peek() !== '}' &&
      this.peek() !== ']' &&
      this.peek() !== '"' &&
      this.peek() !== "'"
    ) {
      key += this.next()
    }
    return key
  }

  /**
   * Captures content greedily until it encounters a delimiter that marks the start of the
   * next property or the end of a structure. This is the fallback used when the strict JSON
   * path failed, so the boundary test runs in `'greedy'` mode: when the Schema declares
   * property names for this level, capture stops only at a declared key (see
   * {@link RepairParser.isBoundaryAhead}).
   *
   * It also tracks balanced delimiters (parentheses, brackets, braces) and quotes, so that
   * structural markers inside DSL-like strings (e.g. `@weather(location="SH, CN")`) stay
   * part of the captured value, and implements the "Parity Rule" for quote stripping.
   */
  private consumeGreedyString(): string {
    let content = ''
    const stack: string[] = [] // Tracks nesting of (, [, {
    let inQuote = false
    let quoteChar = ''

    while (this.pos < this.input.length) {
      const char = this.peek()

      // Top-level structural delimiters (comma, closing brace/bracket, or next key)
      // always break greedy capture if we are NOT inside a nested structure (stack is empty).
      // This prioritization handles cases with broken/unescaped quotes by ensuring
      // we stop at valid JSON boundaries.
      if (stack.length === 0 && this.isAtDelimiter('greedy')) {
        break
      }

      if (!inQuote) {
        if (char === '"' || char === "'") {
          inQuote = true
          quoteChar = char
        } else if (char === '(' || char === '[' || char === '{') {
          stack.push(char)
        } else if (char === ')' || char === ']' || char === '}') {
          const top = stack[stack.length - 1]
          // Pop the stack only if delimiters are correctly balanced.
          if (
            (char === ')' && top === '(') ||
            (char === ']' && top === '[') ||
            (char === '}' && top === '{')
          ) {
            stack.pop()
          }
        }
      } else {
        // Inside a quote, we only look for the matching closing quote,
        // while respecting backslash escapes.
        if (char === quoteChar) {
          let backslashes = 0
          let p = this.pos - 1
          while (p >= 0 && this.input[p] === '\\') {
            backslashes++
            p--
          }
          // If the quote is not escaped (even number of backslashes before it), close the state.
          if (backslashes % 2 === 0) {
            inQuote = false
          }
        }
      }
      content += this.next()
    }

    let result = content.trim()

    // Parity Rule implementation
    if (result.length >= 2) {
      const first = result[0]
      const last = result[result.length - 1]
      if ((first === '"' || first === "'") && first === last) {
        const middle = result.slice(1, -1)
        let internalQuoteCount = 0
        for (let i = 0; i < middle.length; i++) {
          if (middle[i] === first && (i === 0 || middle[i - 1] !== '\\')) {
            internalQuoteCount++
          }
        }
        if (internalQuoteCount % 2 === 1 || internalQuoteCount === 0) {
          return middle
        }
      }
    }

    return result
  }

  /**
   * Probes whether the current position marks a structural delimiter (end or next property).
   */
  private isAtDelimiter(mode: 'structural' | 'greedy' = 'greedy'): boolean {
    if (this.pos >= this.input.length) return true
    const char = this.peek()
    if (char === '}' || char === ']') return true

    const currentIsArray =
      typeof this.pathStack[this.pathStack.length - 1] === 'number'

    if (char === ',') {
      if (currentIsArray) return true
      const remaining = this.input.slice(this.pos + 1)
      if (/^\s*[}\]]/.test(remaining)) return true
      return this.isBoundaryAhead(this.pos + 1, mode)
    }

    if (this.isBoundaryAhead(this.pos, mode)) return true

    if (this.isWhitespace(char)) {
      const savedPos = this.pos
      this.skipWhitespace()
      const nextChar = this.peek()
      const isDelim =
        nextChar === '}' ||
        nextChar === ']' ||
        nextChar === ',' ||
        this.isBoundaryAhead(this.pos, mode)
      this.pos = savedPos
      return isDelim
    }
    return false
  }

  /**
   * Checks if the upcoming text looks like a property key defined in the Schema at the given path.
   */
  private isLookingAtKey(path: JSONPath, startPos: number = this.pos): boolean {
    const key = this.matchKey(startPos)
    return key !== null && this.walker.isValidProperty(path, key)
  }

  /**
   * Matches a property key at `startPos`, including quoted keys that contain
   * whitespace/commas/colons (`"Official language":`), and returns the decoded key.
   */
  private matchKey(startPos: number = this.pos): string | null {
    const remaining = this.input.slice(startPos)
    const match = remaining.match(
      /^\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"',:{}\[\]]+))\s*:/
    )
    if (!match) return null
    const quoted = match[1] !== undefined || match[2] !== undefined
    let key = match[1] ?? match[2] ?? match[3]
    if (quoted) key = key.replace(/\\(["'\\])/g, '$1')
    return key
  }

  /**
   * Is a property boundary (a key followed by ':') ahead of `startPos`?
   *
   * - 'structural': trust any key-shaped token. Used right after a value was parsed by the
   *   strict JSON path, so a successful parse is never thrown away.
   * - 'greedy': when the Schema declares property names at this level, stop only at a
   *   declared key; otherwise text that merely looks like `"foo bar":` would cut the value.
   */
  private isBoundaryAhead(
    startPos: number,
    mode: 'structural' | 'greedy'
  ): boolean {
    const key = this.matchKey(startPos)
    if (key === null) return false
    const parent = this.pathStack.slice(0, -1)
    if (mode === 'structural') return true
    if (this.options.stringCaptureStrategy === 'conservative') return true
    if (this.walker.hasDeclaredProperties(parent)) {
      return this.walker.isDeclaredProperty(parent, key)
    }
    return this.walker.isValidProperty(parent, key)
  }

  /**
   * Performs type coercion and semantic repair based on the Schema.
   * Handles fuzzy enum matching, noisy number extraction, and boolean variants.
   */
  private coerceValue(val: any, schema: any): any {
    const types = Array.isArray(schema.type)
      ? schema.type
      : schema.type
        ? [schema.type]
        : []
    const strVal = String(val).trim()

    // 1. Enum matching
    if (schema.enum) {
      const normalizedInput = strVal.toLowerCase().replace(/[^a-z0-9]/g, '')
      for (const enumItem of schema.enum) {
        const normalizedEnum = String(enumItem)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        if (normalizedInput === normalizedEnum) {
          return enumItem
        }
      }
    }

    const actualType = val === null ? 'null' : typeof val
    if (types.length > 0 && types.includes(actualType)) {
      return val
    }

    // 2. Number conversion (handles thousands separators and units)
    if (types.includes('number') || types.includes('integer')) {
      let cleaned = strVal
        .replace(/([^0-9.\-])/g, (match) => {
          if (match === ',' || match === '，') return ''
          return ' '
        })
        .trim()
        .split(/\s+/)[0]

      const n = parseFloat(cleaned)
      if (!isNaN(n)) {
        return types.includes('integer') ? Math.round(n) : n
      }
    }

    // 3. Boolean conversion (supports yes/no/on/off/1/0)
    if (types.includes('boolean')) {
      const lower = strVal.toLowerCase()
      const trueValues = [
        'true',
        'yes',
        'on',
        '1',
        'ok',
        '确定',
        '是',
        'y',
        't',
      ]
      const falseValues = ['false', 'no', 'off', '0', '取消', '否', 'n', 'f']
      if (trueValues.includes(lower)) return true
      if (falseValues.includes(lower)) return false
    }

    if (types.includes('null') && strVal.toLowerCase() === 'null') {
      return null
    }

    return val
  }

  /**
   * Consumes a standard JSON string.
   */
  private consumeString(): string {
    const quote = this.next()
    let str = ''
    while (this.pos < this.input.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.next()
        if (this.pos < this.input.length) str += this.next()
      } else {
        str += this.next()
      }
    }
    if (this.peek() === quote) this.next()
    return str
  }

  /**
   * Matches a JSON number literal at the current position.
   *
   * Scientific notation (`1e5`, `-2E2`) and a leading `+` are accepted; the match always
   * stops at the end of a well-formed literal so that leftovers such as `1.2.3` remain
   * available for greedy capture instead of being silently truncated.
   */
  private static readonly NUMBER_PATTERN =
    /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/

  /**
   * Consumes a standard JSON number.
   */
  private consumeNumber(): number {
    const match = this.input.slice(this.pos).match(RepairParser.NUMBER_PATTERN)
    if (!match) return NaN
    this.pos += match[0].length
    return parseFloat(match[0])
  }

  /**
   * Consumes a standard JSON boolean.
   */
  private consumeBoolean(): boolean {
    const s = this.input.slice(this.pos)
    if (s.startsWith('true')) {
      this.pos += 4
      return true
    }
    if (s.startsWith('false')) {
      this.pos += 5
      return false
    }
    return false
  }

  /**
   * Consumes a standard JSON null.
   */
  private consumeNull(): null {
    this.pos += 4
    return null
  }

  private peek() {
    return this.input[this.pos]
  }
  private next() {
    return this.input[this.pos++]
  }
  private consumeChar(c: string) {
    if (this.peek() === c) this.next()
  }
  private isWhitespace(c: string) {
    return /\s/.test(c)
  }
  private isDigit(c: string) {
    return /[0-9]/.test(c)
  }
  private skipWhitespace() {
    while (this.pos < this.input.length && this.isWhitespace(this.peek()))
      this.pos++
  }
}
