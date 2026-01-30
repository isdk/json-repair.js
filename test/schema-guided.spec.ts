import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/index.js';

describe('jsonRepair Schema-Guided', () => {
  it('should repair the OR logic example (Greedy Capture)', async () => {
    const orSchema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        intent: { type: 'string' }
      }
    };
    const input = `{ 
      query: "python quicksort" OR "Python 快速排序", 
      intent: 用户在寻找python语言的快速排序 
    }`;
    const result = await jsonRepair(input, orSchema);
    expect(result).toEqual({
      query: '"python quicksort" OR "Python 快速排序"',
      intent: '用户在寻找python语言的快速排序'
    });
  });

  it('should handle implicit root object (missing braces)', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      }
    };
    const input = "name: John, age: 30";
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should handle arrays with mixed formats', async () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } }
      }
    };
    const input = '{ "tags": [javascript, "typescript", coffeescript] }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      tags: ['javascript', 'typescript', 'coffeescript']
    });
  });

  it('should handle nested structures with broken parts', async () => {
    const schema = {
      type: 'object',
      properties: {
        info: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            note: { type: 'string' }
          }
        },
        name: { type: 'string' }
      }
    };
    const input = '{ info: { id: 101 note: This is a note } name: "Alice" }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      info: { id: 101, note: 'This is a note' },
      name: 'Alice'
    });
  });

  it('should repair array of strings with @ symbols and function-like syntax', async () => {
    const text = `[ @weather(location="上海, 中国", date="today"), @weather(location="杭州, 中国", date="today")]`;
    const schema =  {type: 'array', items: { type: 'string'}};
    const result = await jsonRepair(text, schema);
    expect(result).toEqual([
      "@weather(location=\"上海, 中国\", date=\"today\")",
      "@weather(location=\"杭州, 中国\", date=\"today\")"
    ]);
  });
});
