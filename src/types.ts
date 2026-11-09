/**
 * Options for the JSON repair process.
 */
export interface RepairOptions {
  /**
   * Fuzzy matching of property keys against the Schema's declared `properties`.
   *
   * - `false` (default): Only an exactly declared key counts as a match.
   * - `true`: Case-insensitive and separator-insensitive matching, so `user_name`,
   *   `userName`, `USER-NAME` and `user name` all resolve to the declared key.
   * - `(key: string, properties: string[]) => string | undefined`: Custom mapping logic;
   *   it receives the incoming key and the declared names, and returns the name to use
   *   (or `undefined` to fall back to the incoming key).
   *
   * A match renames the key to the Schema's name in the output and makes nested Schema
   * lookups (and therefore type coercion) work for it.
   * When you reuse a `SchemaWalker`, pass this option to `SchemaWalker.create()`.
   */
  keyMatching?:
    | boolean
    | ((key: string, properties: string[]) => string | undefined)

  /**
   * Strategy for greedy string capture when the strict JSON path failed for a value.
   *
   * - `'aggressive'` (default): When the Schema declares property names for the current
   *   level, the captured value only ends at one of those declared keys. Text that merely
   *   looks like `"some words":` stays inside the value.
   * - `'conservative'`: Any text matching the `"key":` / `key:` pattern ends the value,
   *   which keeps the structure of the document at the cost of cutting values short.
   *
   * Neither strategy affects values that were parsed by the strict JSON path; the
   * boundary rules described in the README apply to those unchanged.
   */
  stringCaptureStrategy?: 'conservative' | 'aggressive'

  /**
   * Whether to attempt type coercion based on the Schema.
   *
   * If `true`, the parser will try to convert values to the expected type (e.g., "123" to 123 for numbers, "yes" to true for booleans).
   */
  coerceTypes?: boolean

  /**
   * Defines how to handle properties not defined in the Schema.
   *
   * - `'keep'` (default): Keeps these extra properties in the output.
   * - `'remove'`: Drops them. Only applies at a level whose Schema declares `properties`;
   *   a free-form level has no "extra" keys and is left untouched.
   *
   * This option is independent from the JSON Schema keyword `additionalProperties: false`,
   * which is respected on its own when validating incoming keys.
   */
  additionalProperties?: 'keep' | 'remove'
}

/**
 * Represents the current path in a JSON structure.
 * A list of strings (keys) and numbers (indices).
 */
export type JSONPath = (string | number)[]
