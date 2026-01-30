import { describe, it, expect } from 'vitest';
import { jsonRepair } from '../src/index.js';

describe('jsonRepair Basic Syntax', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      isActive: { type: 'boolean' },
      info: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      }
    }
  };

  it('should parse standard JSON', async () => {
    const input = '{"name": "John", "age": 30, "isActive": true, "info": {"id": 1}}';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({
      name: 'John',
      age: 30,
      isActive: true,
      info: { id: 1 }
    });
  });

  it('should handle unquoted keys and values', async () => {
    const input = '{ name: John, age: 30, isActive: true }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({ name: 'John', age: 30, isActive: true });
  });

  it('should handle single quotes', async () => {
    const input = "{ 'name': 'John', \"age\": 30 }";
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should handle missing commas', async () => {
    const input = '{ name: "John" age: 30 isActive: false }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({ name: 'John', age: 30, isActive: false });
  });

  it('should handle trailing commas', async () => {
    const input = '{"name": "John", "age": 30, }';
    const result = await jsonRepair(input, schema);
    expect(result).toEqual({ name: 'John', age: 30 });
  });
});
