import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONPath } from '../types.js';

/**
 * Navigates through a JSON Schema based on a JSON Path.
 * Handles $ref resolution and provides type information for specific paths.
 */
export class SchemaWalker {
  private dereferencedSchema: any;

  private constructor(schema: any) {
    this.dereferencedSchema = schema;
  }

  /**
   * Static factory method to create a SchemaWalker instance.
   * Asynchronously dereferences the provided JSON Schema.
   * 
   * @param schema - The JSON Schema object to walk.
   * @returns A promise that resolves to a SchemaWalker instance.
   */
  static async create(schema: any): Promise<SchemaWalker> {
    if (!schema) {
      return new SchemaWalker({});
    }
    const parser = new $RefParser();
    const dereferenced = await parser.dereference(schema);
    return new SchemaWalker(dereferenced);
  }

  /**
   * Retrieves the sub-schema for a given JSON path.
   * 
   * @param path - The path to navigate to.
   * @returns The sub-schema at the specified path, or undefined if not found.
   */
  getSchemaForPath(path: JSONPath): any {
    let current = this.dereferencedSchema;
    for (const segment of path) {
      if (!current) return undefined;
      if (current.type === 'object' || current.properties) {
        current = current.properties?.[segment] || current.additionalProperties;
      } else if (current.type === 'array' || current.items) {
        current = Array.isArray(current.items) 
          ? (current.items[segment as number] || current.additionalItems)
          : current.items;
      } else if (Object.keys(current).length === 0) {
        // Empty schema matches anything, but we don't have a sub-schema for children
        return {}; 
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * Determines if a property key is valid for the given path according to the Schema.
   * 
   * @param path - The current parent path.
   * @param key - The property key to check.
   * @returns True if the property is defined in the Schema or allowed by additionalProperties.
   */
  isValidProperty(path: JSONPath, key: string): boolean {
    const schema = this.getSchemaForPath(path);
    if (!schema) return true; // No schema means anything is valid
    
    // If it's an empty schema, it allows everything
    if (Object.keys(schema).length === 0) return true;

    if (schema.type && schema.type !== 'object') return false;
    
    if (schema.properties) {
      if (schema.properties[key]) return true;
      return schema.additionalProperties !== false;
    }
    
    // If it's an object but no properties defined, check additionalProperties
    return schema.additionalProperties !== false;
  }

  /**
   * Gets the expected types for a specific property at a given path.
   * 
   * @param path - The current parent path.
   * @param key - The property key.
   * @returns An array of expected type strings (e.g., ["string", "number"]).
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