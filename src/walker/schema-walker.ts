import $RefParser from '@apidevtools/json-schema-ref-parser'
import { JSONPath, RepairOptions } from '../types.js'

/**
 * Navigates through a JSON Schema based on a JSON Path.
 * Handles $ref resolution and provides type information for specific paths.
 */
export class SchemaWalker {
  private dereferencedSchema: any

  private options: RepairOptions

  private constructor(schema: any, options: RepairOptions = {}) {
    this.dereferencedSchema = schema
    this.options = options
  }

  /**
   * Static factory method to create a SchemaWalker instance.
   * Asynchronously dereferences the provided JSON Schema.
   *
   * @param schema - The JSON Schema object to walk.
   * @param options - Repair options that concern the Schema itself (`keyMatching`).
   * @returns A promise that resolves to a SchemaWalker instance.
   */
  static async create(
    schema: any,
    options: RepairOptions = {}
  ): Promise<SchemaWalker> {
    if (!schema) {
      return new SchemaWalker({}, options)
    }
    const parser = new $RefParser()
    const dereferenced = await parser.dereference(schema)
    return new SchemaWalker(dereferenced, options)
  }

  /**
   * Retrieves the sub-schema for a given JSON path.
   *
   * @param path - The path to navigate to.
   * @returns The sub-schema at the specified path, or undefined if not found.
   */
  getSchemaForPath(path: JSONPath): any {
    let current = this.dereferencedSchema
    for (const segment of path) {
      if (!current) return undefined
      if (current.type === 'object' || current.properties) {
        current = current.properties?.[segment] || current.additionalProperties
      } else if (current.type === 'array' || current.items) {
        current = Array.isArray(current.items)
          ? current.items[segment as number] || current.additionalItems
          : current.items
      } else if (Object.keys(current).length === 0) {
        // Empty schema matches anything, but we don't have a sub-schema for children
        return {}
      } else {
        return undefined
      }
    }
    return current
  }

  /**
   * Determines if a property key is valid for the given path according to the Schema.
   *
   * @param path - The current parent path.
   * @param key - The property key to check.
   * @returns True if the property is defined in the Schema or allowed by additionalProperties.
   */
  isValidProperty(path: JSONPath, key: string): boolean {
    const schema = this.getSchemaForPath(path)
    if (!schema) return true // No schema means anything is valid

    // If it's an empty schema, it allows everything
    if (Object.keys(schema).length === 0) return true

    if (schema.type && schema.type !== 'object') return false

    if (schema.properties) {
      if (this.matchProperty(path, key) !== null) return true
      return schema.additionalProperties !== false
    }

    // If it's an object but no properties defined, check additionalProperties
    return schema.additionalProperties !== false
  }

  /**
   * Resolves an incoming property name to the name declared by the Schema at `path`.
   *
   * Without `keyMatching` this only accepts an exact declaration. With `keyMatching: true`
   * the comparison ignores case and the separators used by the two common naming styles
   * (`user_name` / `userName` / `USER NAME`). A function matcher decides itself and may
   * return a name the Schema does not declare.
   *
   * @param path - The current parent path.
   * @param key - The property key found in the broken document.
   * @returns The canonical Schema property name, or `null` when nothing matches.
   */
  matchProperty(path: JSONPath, key: string): string | null {
    const properties = this.declaredPropertyNames(path)
    if (properties.includes(key)) return key

    const mode = this.options.keyMatching
    if (!mode || properties.length === 0) return null

    if (typeof mode === 'function') {
      const mapped = mode(key, properties)
      return typeof mapped === 'string' && mapped !== '' ? mapped : null
    }

    const wanted = SchemaWalker.normalizeName(key)
    return (
      properties.find((name) => SchemaWalker.normalizeName(name) === wanted) ??
      null
    )
  }

  /**
   * The property names the Schema declares at `path` (empty when the level is free-form).
   */
  declaredPropertyNames(path: JSONPath): string[] {
    const properties = this.getSchemaForPath(path)?.properties
    return properties ? Object.keys(properties) : []
  }

  /**
   * Folding used for fuzzy key matching: case-insensitive and separator-insensitive, so
   * snake_case, kebab-case, camelCase and spaced keys collide.
   */
  private static normalizeName(name: string): string {
    return name.replace(/[\s_\-.]/g, '').toLowerCase()
  }

  /**
   * Whether a property name is explicitly declared in the Schema at the given path.
   *
   * @param path - The current parent path.
   * @param key - The property key to check.
   * @returns True only when `key` appears in the Schema `properties` of that path.
   */
  isDeclaredProperty(path: JSONPath, key: string): boolean {
    const schema = this.getSchemaForPath(path)
    return (
      !!schema?.properties &&
      Object.prototype.hasOwnProperty.call(schema.properties, key)
    )
  }

  /**
   * Whether the Schema at the given path declares any property names at all.
   * Used to decide whether key matching can be strict or has to stay lenient.
   *
   * @param path - The current parent path.
   */
  hasDeclaredProperties(path: JSONPath): boolean {
    const schema = this.getSchemaForPath(path)
    return !!schema?.properties && Object.keys(schema.properties).length > 0
  }

  /**
   * Gets the expected types for a specific property at a given path.
   *
   * @param path - The current parent path.
   * @param key - The property key.
   * @returns An array of expected type strings (e.g., ["string", "number"]).
   */
  getExpectedTypes(path: JSONPath, key: string): string[] {
    const parentSchema = this.getSchemaForPath(path)
    const propSchema = parentSchema?.properties?.[key]
    if (!propSchema) return []

    if (Array.isArray(propSchema.type)) return propSchema.type
    if (propSchema.type) return [propSchema.type]
    return []
  }
}
