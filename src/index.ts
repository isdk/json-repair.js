import { SchemaWalker } from './walker/index.js';
import { RepairParser } from './parser.js';
import { RepairOptions } from './types.js';

export * from './types.js';
export * from './walker/index.js';
export * from './parser.js';

/**
 * 修复并解析由 LLM 生成的 JSON 字符串
 * 
 * @param input 破碎的 JSON 字符串
 * @param schema JSON Schema 对象
 * @param options 修复选项
 * @returns 解析后的 JS 对象
 */
export async function jsonRepair(input: string, schema: any, options: RepairOptions = {}): Promise<any> {
  const walker = await SchemaWalker.create(schema);
  const parser = new RepairParser(walker, options);
  return parser.parse(input);
}
