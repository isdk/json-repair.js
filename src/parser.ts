import { SchemaWalker } from './walker/index.js';
import { RepairOptions, JSONPath } from './types.js';

export class RepairParser {
  private input: string = '';
  private pos: number = 0;
  private pathStack: JSONPath = [];
  private walker: SchemaWalker;
  private options: RepairOptions;

  constructor(walker: SchemaWalker, options: RepairOptions = {}) {
    this.walker = walker;
    this.options = {
      coerceTypes: true,
      ...options
    };
  }

  parse(input: string): any {
    this.input = input.trim();
    this.pos = 0;
    this.pathStack = [];
    return this.consumeValue();
  }

  private consumeValue(): any {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return undefined;

    const char = this.peek();
    const currentSchema = this.walker.getSchemaForPath(this.pathStack);
    const expectedType = currentSchema?.type;

    // 1. 结构化类型处理 (支持隐式对象)
    if (char === '{' || (expectedType === 'object' && this.isLookingAtKey(this.pathStack))) {
      return this.consumeObject();
    }
    if (char === '[') {
      return this.consumeArray();
    }

    const startPos = this.pos;

    // 2. 尝试标准解析
    if (char === '"' || char === "'") {
      try {
        const s = this.consumeString();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) return s;
        this.pos = savedPos;
      } catch (e) { this.pos = startPos; }
    }

    if (this.isDigit(char) || char === '-') {
      try {
        const n = this.consumeNumber();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) return n;
        this.pos = startPos;
      } catch (e) { this.pos = startPos; }
    }

    if (char === 't' || char === 'f' || char === 'n') {
      try {
        const v = char === 'n' ? this.consumeNull() : this.consumeBoolean();
        const savedPos = this.pos;
        this.skipWhitespace();
        if (this.isAtDelimiter() || this.pos >= this.input.length) return v;
        this.pos = savedPos;
      } catch (e) { this.pos = startPos; }
    }

    // 3. 贪婪捕获后的类型协商
    this.pos = startPos;
    const rawValue = this.consumeGreedyString();
    
    if (this.options.coerceTypes && expectedType) {
      return this.coerceValue(rawValue, expectedType);
    }
    
    return rawValue;
  }

  private consumeObject(): any {
    const obj: any = {};
    const hasBraces = this.peek() === '{';
    if (hasBraces) this.consumeChar('{');
    this.skipWhitespace();

    while (this.pos < this.input.length && this.peek() !== '}') {
      const lastPos = this.pos;
      
      // 在隐式模式下，如果接下来的内容看起来像数组结束或逗号后不是 key，则退出
      if (!hasBraces && (this.peek() === ']' || (this.peek() === ',' && !this.isLookingAtKey(this.pathStack.slice(0, -1), this.pos + 1)))) {
        break;
      }

      const key = this.consumeKey();
      if (!key) break;

      // 重点：如果在隐式对象中发现重复 key，说明可能开启了数组中的下一个对象
      if (!hasBraces && obj.hasOwnProperty(key)) {
        this.pos = lastPos; // 回退，让外层数组逻辑处理
        break;
      }

      this.skipWhitespace();
      if (this.peek() === ':') this.consumeChar(':');

      this.pathStack.push(key);
      const val = this.consumeValue();
      if (this.pos !== lastPos || (val !== undefined && val !== '')) {
        obj[key] = val;
      }
      this.pathStack.pop();

      this.skipWhitespace();
      if (this.peek() === ',') {
        // 探测逗号后面是否跟着当前对象的另一个 Key
        const nextIsKey = this.isLookingAtKey(this.pathStack, this.pos + 1);
        if (nextIsKey || (hasBraces && /^\s*[}]/.test(this.input.slice(this.pos + 1)))) {
          this.consumeChar(',');
          this.skipWhitespace();
        } else if (!hasBraces) {
          // 如果是隐式对象且后面不是自己的 Key，则这可能是外层数组的逗号，退出
          break;
        } else {
          // 标准对象的容错处理
          this.consumeChar(',');
          this.skipWhitespace();
        }
      } else if (this.peek() !== '}' && this.isLookingAtKey(this.pathStack)) {
        // 缺少逗号但探测到了下一个 Key
        this.skipWhitespace();
      }

      if (this.pos === lastPos) break;
    }
    if (hasBraces && this.peek() === '}') this.consumeChar('}');
    return obj;
  }

  private consumeArray(): any[] {
    const arr: any[] = [];
    this.consumeChar('[');
    this.skipWhitespace();

    let index = 0;
    while (this.pos < this.input.length && this.peek() !== ']') {
      if (this.peek() === '}') break;
      const lastPos = this.pos;
      this.pathStack.push(index);
      const val = this.consumeValue();
      if (this.pos !== lastPos) {
        arr.push(val);
        index++;
      }
      this.pathStack.pop();
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

  private consumeGreedyString(): string {
    let content = '';
    const lastPos = this.pos;
    while (this.pos < this.input.length) {
      if (this.isAtDelimiter()) break;
      content += this.next();
    }
    if (this.pos === lastPos && this.pos < this.input.length && !this.isAtDelimiter()) {
      content += this.next();
    }
    
    let result = content.trim();
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

  private isAtDelimiter(): boolean {
    if (this.pos >= this.input.length) return true;
    const char = this.peek();
    if (char === '}' || char === ']' || char === ',') return true;
    
    // 探测下一个 Key，注意这里我们要探测的是父级（当前对象）的 Key
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

  private isLookingAtKey(path: JSONPath, startPos: number = this.pos): boolean {
    const remaining = this.input.slice(startPos);
    const match = remaining.match(/^\s*["']?([^"'\s:]+)["']?\s*:/);
    if (match) {
      const potentialKey = match[1];
      return this.walker.isValidProperty(path, potentialKey);
    }
    return false;
  }

  private coerceValue(val: string, type: string | string[]): any {
    const types = Array.isArray(type) ? type : [type];
    const cleanedVal = val.trim();

    if (types.includes('number') || types.includes('integer')) {
      let cleaned = cleanedVal.replace(/[,，]/g, '.')
                       .replace(/[^0-9.\-]/g, ' ')
                       .trim().split(/\s+/)[0];
      const n = parseFloat(cleaned);
      if (!isNaN(n)) return n;
    }

    if (types.includes('boolean')) {
      const lower = cleanedVal.toLowerCase();
      if (['true', 'yes', 'on', '1', 'ok', '确定'].includes(lower)) return true;
      if (['false', 'no', 'off', '0', '取消'].includes(lower)) return false;
    }

    if (types.includes('null') && cleanedVal.toLowerCase() === 'null') {
      return null;
    }

    return val;
  }

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

  private consumeNumber(): number {
    let numStr = '';
    while (this.pos < this.input.length && /[0-9.\-]/.test(this.peek())) {
      numStr += this.next();
    }
    return parseFloat(numStr);
  }

  private consumeBoolean(): boolean {
    const s = this.input.slice(this.pos);
    if (s.startsWith('true')) { this.pos += 4; return true; }
    if (s.startsWith('false')) { this.pos += 5; return false; }
    return false;
  }

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
