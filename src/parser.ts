import { SchemaWalker } from './walker/index.js';
import { RepairOptions, JSONPath } from './types.js';

/**
 * A state-machine based parser that repairs and extracts structured data from broken JSON strings.
 * It uses a JSON Schema to guide the parsing process, especially for handling ambiguous or missing syntax.
 */
export class RepairParser {
  private input: string = '';
  private pos: number = 0;
  private pathStack: JSONPath = [];
  private walker: SchemaWalker;
  private options: RepairOptions;

  /**
   * Creates a new RepairParser instance.
   * 
   * @param walker - An initialized SchemaWalker instance for Schema guidance.
   * @param options - Configuration options for the repair process.
   */
  constructor(walker: SchemaWalker, options: RepairOptions = {}) {
    this.walker = walker;
    this.options = {
      coerceTypes: true,
      ...options
    };
  }

  /**
   * Parses the input string and returns the repaired JavaScript object.
   * 
   * @param input - The potentially broken JSON string.
   * @returns The parsed and repaired object.
   */
  parse(input: string): any {
    this.input = input.trim();
    this.pos = 0;
    this.pathStack = [];
    return this.consumeValue();
  }

  /**
   * Consumes a single value from the input.
   * Uses Schema guidance to decide whether to use standard parsing or greedy capture.
   */
  private consumeValue(): any {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return undefined;

    const char = this.peek();
    const currentSchema = this.walker.getSchemaForPath(this.pathStack);
    const expectedType = currentSchema?.type;

    // 1. Structured types (supports implicit objects)
    if (char === '{' || (expectedType === 'object' && this.isLookingAtKey(this.pathStack))) {
      return this.consumeObject();
    }
    if (char === '[') {
      return this.consumeArray();
    }

    const startPos = this.pos;
    let result: any;
    let success = false;

    // 2. Try Standard Parsing
    if (char === '"' || char === "'") {
      try {
        result = this.consumeString();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) {
          success = true;
        } else {
          this.pos = startPos;
        }
      } catch (e) { this.pos = startPos; }
    } else if (this.isDigit(char) || char === '-') {
      try {
        result = this.consumeNumber();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) {
          success = true;
        } else {
          this.pos = startPos;
        }
      } catch (e) { this.pos = startPos; }
    } else if (char === 't' || char === 'f' || char === 'n') {
      try {
        result = char === 'n' ? this.consumeNull() : this.consumeBoolean();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) {
          success = true;
        } else {
          this.pos = startPos;
        }
      } catch (e) { this.pos = startPos; }
    }

    if (success) {
      if (this.options.coerceTypes && currentSchema) {
        return this.coerceValue(result, currentSchema);
      }
      return result;
    }

    // 3. Fallback to Greedy Capture
    this.pos = startPos;
    const rawValue = this.consumeGreedyString();
    
    if (this.options.coerceTypes && currentSchema) {
      return this.coerceValue(rawValue, currentSchema);
    }
    
    return rawValue;
  }

  /**
   * Parses a JSON object, handling both standard and implicit (no braces) structures.
   */
  private consumeObject(): any {
    const obj: any = {};
    const hasBraces = this.peek() === '{';
    if (hasBraces) this.consumeChar('{');
    this.skipWhitespace();

    while (this.pos < this.input.length && this.peek() !== '}') {
      const lastPos = this.pos;
      if (!hasBraces && (this.peek() === ']' || (this.peek() === ',' && !this.isLookingAtKey(this.pathStack.slice(0, -1), this.pos + 1)))) {
        break;
      }

      const key = this.consumeKey();
      if (!key) break;

      // Handle duplicate keys in implicit objects within an array context
      if (!hasBraces && obj.hasOwnProperty(key)) {
        this.pos = lastPos; 
        break;
      }

      this.skipWhitespace();
      if (this.peek() === ':') this.consumeChar(':');

      this.pathStack.push(key);
      try {
        const val = this.consumeValue();
        if (this.pos !== lastPos || (val !== undefined && val !== '')) {
          obj[key] = val;
        }
      } finally {
        this.pathStack.pop();
      }

      this.skipWhitespace();
      if (this.peek() === ',') {
        const nextIsKey = this.isLookingAtKey(this.pathStack, this.pos + 1);
        if (nextIsKey || (hasBraces && /^\s*[}]/.test(this.input.slice(this.pos + 1)))) {
          this.consumeChar(',');
          this.skipWhitespace();
        } else if (!hasBraces) {
          break;
        } else {
          this.consumeChar(',');
          this.skipWhitespace();
        }
      } else if (this.peek() !== '}' && this.isLookingAtKey(this.pathStack)) {
        this.skipWhitespace();
      }

      if (this.pos === lastPos) break;
    }
    if (hasBraces && this.peek() === '}') this.consumeChar('}');
    return obj;
  }

  /**
   * Parses a JSON array.
   */
  private consumeArray(): any[] {
    const arr: any[] = [];
    this.consumeChar('[');
    this.skipWhitespace();

    let index = 0;
    while (this.pos < this.input.length && this.peek() !== ']') {
      if (this.peek() === '}') break;
      const lastPos = this.pos;
      this.pathStack.push(index);
      try {
        const val = this.consumeValue();
        if (this.pos !== lastPos) {
          arr.push(val);
          index++;
        }
      } finally {
        this.pathStack.pop();
      }
      this.skipWhitespace();
      if (this.peek() === ',') {
        this.consumeChar(',');
        this.skipWhitespace();
      }
      if (this.pos === lastPos) break;
    }
    if (this.peek() === ']') this.consumeChar(']');
    return arr;
  }

  /**
   * Consumes a property key, handling both quoted and unquoted keys.
   */
  private consumeKey(): string {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return '';
    if (this.peek() === '"' || this.peek() === "'") return this.consumeString();
    
    let key = '';
    while (this.pos < this.input.length && !this.isWhitespace(this.peek()) && 
           this.peek() !== ':' && this.peek() !== ',' && 
           this.peek() !== '}' && this.peek() !== ']') {
      key += this.next();
    }
    return key;
  }

  /**
   * Captures content greedily until it encounters a delimiter that marks the start of the next property or the end of a structure.
   * Implements the "Parity Rule" for smart quote stripping.
   */
  /**
   * Captures content greedily until it encounters a delimiter that marks the start of the next property or the end of a structure.
   *
   * This enhanced version tracks balanced delimiters (parentheses, brackets, braces) and quotes
   * to ensure that structural markers (like commas or colons) inside DSL-like strings
   * (e.g., `@weather(location="SH, CN")`) are correctly captured as part of the string.
   *
   * It also prioritizes top-level structural delimiters to prevent unescaped quotes from
   * consuming the rest of the JSON.
   */
  private consumeGreedyString(): string {
    let content = '';
    const stack: string[] = []; // Tracks nesting of (, [, {
    let inQuote = false;
    let quoteChar = '';

    while (this.pos < this.input.length) {
      const char = this.peek();

      // Top-level structural delimiters (comma, closing brace/bracket, or next key)
      // always break greedy capture if we are NOT inside a nested structure (stack is empty).
      // This prioritization handles cases with broken/unescaped quotes by ensuring
      // we stop at valid JSON boundaries.
      if (stack.length === 0 && this.isAtDelimiter()) {
        break;
      }

      if (!inQuote) {
        if (char === '"' || char === "'") {
          inQuote = true;
          quoteChar = char;
        } else if (char === '(' || char === '[' || char === '{') {
          stack.push(char);
        } else if (char === ')' || char === ']' || char === '}') {
          const top = stack[stack.length - 1];
          // Pop the stack only if delimiters are correctly balanced.
          if (
            (char === ')' && top === '(') ||
            (char === ']' && top === '[') ||
            (char === '}' && top === '{')
          ) {
            stack.pop();
          }
        }
      } else {
        // Inside a quote, we only look for the matching closing quote,
        // while respecting backslash escapes.
        if (char === quoteChar) {
          let backslashes = 0;
          let p = this.pos - 1;
          while (p >= 0 && this.input[p] === '\\') {
            backslashes++;
            p--;
          }
          // If the quote is not escaped (even number of backslashes before it), close the state.
          if (backslashes % 2 === 0) {
            inQuote = false;
          }
        }
      }
      content += this.next();
    }
    
    let result = content.trim();
    
    // Parity Rule implementation
    if (result.length >= 2) {
      const first = result[0];
      const last = result[result.length - 1];
      if ((first === '"' || first === "'") && first === last) {
        const middle = result.slice(1, -1);
        let internalQuoteCount = 0;
        for (let i = 0; i < middle.length; i++) {
          if (middle[i] === first && (i === 0 || middle[i - 1] !== '\\')) {
            internalQuoteCount++;
          }
        }
        if (internalQuoteCount % 2 === 1 || internalQuoteCount === 0) {
          return middle;
        }
      }
    }
    
    return result;
  }

  /**
   * Probes whether the current position marks a structural delimiter (end or next property).
   */
  private isAtDelimiter(): boolean {
    if (this.pos >= this.input.length) return true;
    const char = this.peek();
    if (char === '}' || char === ']') return true;
    
    const currentIsArray = typeof this.pathStack[this.pathStack.length - 1] === 'number';
    
    if (char === ',') {
      if (currentIsArray) return true; 
      const remaining = this.input.slice(this.pos + 1);
      if (/^\s*[}\]]/.test(remaining)) return true;
      return this.isLookingAtKey(this.pathStack.slice(0, -1), this.pos + 1);
    }

    if (this.isLookingAtKey(this.pathStack.slice(0, -1))) return true;

    if (this.isWhitespace(char)) {
      const savedPos = this.pos;
      this.skipWhitespace();
      const nextChar = this.peek();
      const isDelim = nextChar === '}' || nextChar === ']' || nextChar === ',' || this.isLookingAtKey(this.pathStack.slice(0, -1));
      this.pos = savedPos;
      return isDelim;
    }
    return false;
  }

  /**
   * Checks if the upcoming text looks like a property key defined in the Schema at the given path.
   */
  private isLookingAtKey(path: JSONPath, startPos: number = this.pos): boolean {
    const remaining = this.input.slice(startPos);
    const match = remaining.match(/^\s*["']?([^"'\s:]+)["']?\s*:/);
    if (match) {
      const potentialKey = match[1];
      return this.walker.isValidProperty(path, potentialKey);
    }
    return false;
  }

  /**
   * Performs type coercion and semantic repair based on the Schema.
   * Handles fuzzy enum matching, noisy number extraction, and boolean variants.
   */
  private coerceValue(val: any, schema: any): any {
    const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
    const strVal = String(val).trim();

    // 1. Enum matching
    if (schema.enum) {
      const normalizedInput = strVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const enumItem of schema.enum) {
        const normalizedEnum = String(enumItem).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedInput === normalizedEnum) {
          return enumItem;
        }
      }
    }

    const actualType = val === null ? 'null' : typeof val;
    if (types.length > 0 && types.includes(actualType)) {
      return val;
    }

    // 2. Number conversion (handles thousands separators and units)
    if (types.includes('number') || types.includes('integer')) {
      let cleaned = strVal.replace(/([^0-9.\-])/g, (match) => {
        if (match === ',' || match === '，') return ''; 
        return ' ';
      }).trim().split(/\s+/)[0];
      
      const n = parseFloat(cleaned);
      if (!isNaN(n)) {
        return types.includes('integer') ? Math.round(n) : n;
      }
    }

    // 3. Boolean conversion (supports yes/no/on/off/1/0)
    if (types.includes('boolean')) {
      const lower = strVal.toLowerCase();
      const trueValues = ['true', 'yes', 'on', '1', 'ok', '确定', '是', 'y', 't'];
      const falseValues = ['false', 'no', 'off', '0', '取消', '否', 'n', 'f'];
      if (trueValues.includes(lower)) return true;
      if (falseValues.includes(lower)) return false;
    }

    if (types.includes('null') && strVal.toLowerCase() === 'null') {
      return null;
    }

    return val;
  }

  /**
   * Consumes a standard JSON string.
   */
  private consumeString(): string {
    const quote = this.next();
    let str = '';
    while (this.pos < this.input.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.next();
        if (this.pos < this.input.length) str += this.next();
      } else {
        str += this.next();
      }
    }
    if (this.peek() === quote) this.next();
    return str;
  }

  /**
   * Consumes a standard JSON number.
   */
  private consumeNumber(): number {
    let numStr = '';
    while (this.pos < this.input.length && /[0-9.\-]/.test(this.peek())) {
      numStr += this.next();
    }
    return parseFloat(numStr);
  }

  /**
   * Consumes a standard JSON boolean.
   */
  private consumeBoolean(): boolean {
    const s = this.input.slice(this.pos);
    if (s.startsWith('true')) { this.pos += 4; return true; }
    if (s.startsWith('false')) { this.pos += 5; return false; }
    return false;
  }

  /**
   * Consumes a standard JSON null.
   */
  private consumeNull(): null {
    this.pos += 4; return null;
  }

  private peek() { return this.input[this.pos]; }
  private next() { return this.input[this.pos++]; }
  private consumeChar(c: string) { if (this.peek() === c) this.next(); }
  private isWhitespace(c: string) { return /\s/.test(c); }
  private isDigit(c: string) { return /[0-9]/.test(c); }
  private skipWhitespace() {
    while (this.pos < this.input.length && this.isWhitespace(this.peek())) this.pos++;
  }
}