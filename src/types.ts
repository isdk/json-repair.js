/**
 * Options for the JSON repair process.
 */
export interface RepairOptions {
  /**
   * Fuzzy matching for keys.
   * 
   * - `false` (default): Strict matching against the Schema defined keys.
   * - `true`: Allows case-insensitive matching and conversion between snake_case and camelCase.
   * - `(key: string, properties: string[]) => string | undefined`: Custom mapping logic to find a matching property name.
   */
  keyMatching?: boolean | ((key: string, properties: string[]) => string | undefined);

  /**
   * Strategy for greedy string capture when standard JSON parsing fails.
   * 
   * - `'conservative'`: Stops at any text matching the `"key":` pattern.
   * - `'aggressive'` (default): Only stops if the key exists in the Schema and its following value type matches the expectations.
   */
  stringCaptureStrategy?: 'conservative' | 'aggressive';

  /**
   * Whether to attempt type coercion based on the Schema.
   * 
   * If `true`, the parser will try to convert values to the expected type (e.g., "123" to 123 for numbers, "yes" to true for booleans).
   */
  coerceTypes?: boolean;

  /**
   * Defines how to handle properties not defined in the Schema.
   * 
   * - `'keep'` (default): Keeps these extra properties in the output.
   * - `'remove'`: Automatically removes properties not found in the Schema.
   */
  additionalProperties?: 'keep' | 'remove';
}

/**
 * Represents the current path in a JSON structure.
 * A list of strings (keys) and numbers (indices).
 */
export type JSONPath = (string | number)[];