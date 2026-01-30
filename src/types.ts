export interface RepairOptions {
  /**
   * 键名模糊匹配
   * false: 严格匹配 Schema 定义的 key
   * true: 允许大小写、下划线/驼峰转换 (如 product_id 匹配 productId)
   * (key: string, properties: string[]) => string | undefined: 自定义映射逻辑
   */
  keyMatching?: boolean | ((key: string, properties: string[]) => string | undefined);

  /**
   * 字符串捕获策略
   * 'conservative': 遇到任何符合 "key": 模式的文本都停止
   * 'aggressive': 只有当 key 在 Schema 中且后续值类型匹配时才停止
   */
  stringCaptureStrategy?: 'conservative' | 'aggressive';

  /**
   * 类型强制转换
   * true: 尝试将 "123" 转为 number, "yes" 转为 boolean
   */
  coerceTypes?: boolean;

  /**
   * 处理 Schema 未定义的属性
   * 'keep': 保留这些额外属性
   * 'remove': 自动删除不在 Schema 中的属性
   */
  additionalProperties?: 'keep' | 'remove';
}

export type JSONPath = (string | number)[];
