import { describe, it, expect } from 'vitest'
import { jsonRepair } from '../src/index.js'

describe('jsonRepair Semantic Enhancements', () => {
  it('should fuzzy match enum values', async () => {
    const schema = {
      type: 'object',
      properties: {
        status: { enum: ['processing', 'completed', 'failed'] },
      },
    }
    // 大小写和标点符号不匹配
    const result = await jsonRepair('{ "status": "Processing!" }', schema)
    expect(result.status).toBe('processing')
  })

  it('should parse noisy numbers', async () => {
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        count: { type: 'integer' },
      },
    }
    // 包含货币符号、中文、千分位
    const input = '{ price: "约 1,200.50 元", count: "5个" }'
    const result = await jsonRepair(input, schema)
    expect(result.price).toBe(1200.5)
    expect(result.count).toBe(5)
  })

  it('extracts the number when the surrounding text contains dots', async () => {
    const schema = {
      type: 'object',
      properties: { price: { type: 'number' } },
    }
    const cases: [string, number][] = [
      ['Approx. 1,200.50 USD', 1200.5],
      ['$1,200', 1200],
      ['Temp: -4.5C', -4.5],
      ['12 apples', 12],
      ['takes 1.5e3 ms', 1500],
    ]
    for (const [text, expected] of cases) {
      const result = await jsonRepair(`{ price: "${text}" }`, schema)
      expect(result.price, text).toBe(expected)
    }
  })

  it('leaves a string without any digits alone', async () => {
    const schema = {
      type: 'object',
      properties: { price: { type: 'number' } },
    }
    const result = await jsonRepair('{ price: "no digits here" }', schema)
    expect(result.price).toBe('no digits here')
  })

  it('takes the first number of a run such as 1.2.3 (best effort)', async () => {
    const schema = {
      type: 'object',
      properties: { price: { type: 'number' } },
    }
    const result = await jsonRepair('{ price: "1.2.3" }', schema)
    expect(result.price).toBe(1.2)
  })

  it('should parse boolean variants', async () => {
    const schema = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        confirmed: { type: 'boolean' },
      },
    }
    const input = '{ enabled: ON, confirmed: 是 }'
    const result = await jsonRepair(input, schema)
    expect(result.enabled).toBe(true)
    expect(result.confirmed).toBe(true)
  })

  it('should fallback to original string if coercion fails', async () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'number' },
      },
    }
    const input = '{ id: "unknown_id" }'
    const result = await jsonRepair(input, schema)
    expect(result.id).toBe('unknown_id')
  })
})
