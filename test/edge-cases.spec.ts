import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/index.js';

describe('jsonRepair Edge Cases', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } }
    }
  };

  it('should handle escaped characters', async () => {
    const input = '{ "name": "John\nDoe", "tags": ["a\"b", "c\\d"] }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      name: 'John\nDoe',
      tags: ['a"b', 'c\d']
    });
  });

  it('should handle empty or whitespace input', async () => {
    const result = await jsonRepair("   ", schema);
    expect(result).toBeUndefined();
  });
});
