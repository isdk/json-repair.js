import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/index.js';

describe('jsonRepair Stress Tests', () => {
  it('should handle implicit objects inside an array', async () => {
    const schema = {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              id: { type: 'number' }
            }
          }
        }
      }
    };
    // LLM 漏掉了数组中对象的花括号，且漏掉了逗号
    const input = '{ "users": [ name: John, id: 1 name: Alice, id: 2 ] }';
    const result = await jsonRepair(input, schema);

    expect(result.users).toHaveLength(2);
    expect(result.users[0]).toEqual({ name: 'John', id: 1 });
    expect(result.users[1]).toEqual({ name: 'Alice', id: 2 });
  });

  it('should handle extreme unclosed nesting', async () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            b: {
              type: 'object',
              properties: {
                c: { type: 'array', items: { type: 'number' } }
              }
            }
          }
        }
      }
    };
    // 在最深处突然中断
    const input = '{ "a": { "b": { "c": [ 1, 2, 3';
    const result = await jsonRepair(input, schema);

    expect(result.a.b.c).toEqual([1, 2, 3]);
  });

  it('should handle malformed escapes and noisy content', async () => {
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        note: { type: 'string' }
      }
    };
    // 混合了错误的转义和无意义的描述
    const input = '{ "path": "C:\\Users\\Admin\\Documents", "note": "See above" }';
    const result = await jsonRepair(input, schema);

    expect(result.path).toContain('Documents');
    expect(result.note).toBe('See above');
  });
});
