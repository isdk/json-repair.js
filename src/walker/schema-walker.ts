import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONPath } from '../types.js';

export class SchemaWalker {
  private dereferencedSchema: any;

  private constructor(schema: any) {
    this.dereferencedSchema = schema;
  }

  /**
   * 静态创建方法，处理异步的 $ref 解析
   */
  static async create(schema: any): Promise<SchemaWalker> {
    const parser = new $RefParser();
    const dereferenced = await parser.dereference(schema);
    return new SchemaWalker(dereferenced);
  }

  /**
   * 根据路径获取子 Schema
   */
  getSchemaForPath(path: JSONPath): any {
    let current = this.dereferencedSchema;
    for (const segment of path) {
      if (current.type === 'object' || current.properties) {
        current = current.properties?.[segment] || current.additionalProperties;
      } else if (current.type === 'array' || current.items) {
        current = Array.isArray(current.items) 
          ? (current.items[segment as number] || current.additionalItems)
          : current.items;
      } else {
        return undefined;
      }
      if (!current) return undefined;
    }
    return current;
  }

  /**
   * 判定某个 key 是否属于当前路径下的合法属性
   */
  isValidProperty(path: JSONPath, key: string): boolean {
    const schema = this.getSchemaForPath(path);
    if (!schema || schema.type !== 'object') return false;
    
    if (schema.properties && schema.properties[key]) return true;
    
    // 如果允许额外属性，则任何 key 都是合法的（但在修复模式下，我们可能更倾向于返回 false 以支持贪婪捕获）
    return false; 
  }

  /**
   * 获取某个属性期望的类型列表
   */
  getExpectedTypes(path: JSONPath, key: string): string[] {
    const parentSchema = this.getSchemaForPath(path);
    const propSchema = parentSchema?.properties?.[key];
    if (!propSchema) return [];
    
    if (Array.isArray(propSchema.type)) return propSchema.type;
    if (propSchema.type) return [propSchema.type];
    return [];
  }
}
