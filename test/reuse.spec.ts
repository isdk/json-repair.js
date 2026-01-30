import { describe, it, expect } from 'vitest';
import { jsonRepair, SchemaWalker } from '../src/index.js';

describe('jsonRepair Reuse Logic', () => {
  it('should support reusing SchemaWalker instance', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    };
    const walker = await SchemaWalker.create(schema);
    
    const start = Date.now();
    const result1 = await jsonRepair('{ name: John }', walker);
    const result2 = await jsonRepair('{ name: Alice }', walker);
    
    expect(result1.name).toBe('John');
    expect(result2.name).toBe('Alice');
  });
});
