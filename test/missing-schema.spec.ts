import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/repair.js';

describe('jsonRepair with missing or empty schema', () => {
  it('should handle empty object schema', async () => {
    const input = '{"name": "John", "age": 30}';
    const result = await jsonRepair(input, {});
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should handle broken JSON with empty object schema', async () => {
    const input = '{"name": "John", "age": 30'; // Missing closing brace
    const result = await jsonRepair(input, {});
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should handle without schema 1', async () => {
    const input = '{"name": "John"';
    const result = await jsonRepair(input);
    expect(result).toEqual({ name: 'John' });
  });

  it('should handle without schema 2', async () => {
    const input = '{ name: John, age: 30 ';
    const result = await jsonRepair(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should handle schema that is just { "type": "object" }', async () => {
    const input = '{"name": "John"}';
    const result = await jsonRepair(input, { type: 'object' });
    expect(result).toEqual({ name: 'John' });
  });
});
