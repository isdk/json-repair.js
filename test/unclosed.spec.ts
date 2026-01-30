import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/index.js';

describe('jsonRepair Unclosed Structures', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      nested: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          val: { type: 'string' }
        }
      }
    }
  };

  it('should handle unclosed nested objects', async () => {
    const input = "{ name: 'John', nested: { id: 101, val: some value";
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      name: 'John',
      nested: { id: 101, val: 'some value' }
    });
  });

  it('should handle unclosed arrays', async () => {
    const input = "{ tags: [ apple, orange, banana";
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      tags: ['apple', 'orange', 'banana']
    });
  });

  it('should handle deeply nested broken structures', async () => {
    const input = "{ name: 'A', nested: { id: 1, val: 'v' }, tags: [ 't1', 't2' }";
    const result = await jsonRepair(input, schema);
    expect(result.name).toBe('A');
    expect(result.tags).toEqual(['t1', 't2']);
  });
});
