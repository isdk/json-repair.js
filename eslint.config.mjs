import antfu from '@antfu/eslint-config'
import tsdoc from 'eslint-plugin-tsdoc'

/**
 * ESLint 只负责「正确性」，代码风格交给 prettier（见 package.json 的 format 脚本与 .prettierrc）。
 *
 * 这里沿用 ../ai-tool 的做法：用 @antfu 的配置作为底座，但整体关闭风格类与教条类插件层，
 * 只保留指向真实 bug 的核心规则。想重新启用某一层，把对应的 `false` 改成 `true` 即可。
 */
const config = await antfu(
  {
    gitignore: true,
    ignores: ['web/**', 'docs/**', 'dist/**', '.cache/**'],

    // 风格类规则全部交给 prettier
    stylistic: false,
    // 以下插件层噪音太大，先整体关闭
    regexp: false,
    unicorn: false,
    test: false,
    imports: false,
    jsonc: false,
    yaml: false,
    toml: false,
    markdown: false,
  },
  {
    plugins: { tsdoc },
    rules: {
      'tsdoc/syntax': 'off',
      'antfu/no-top-level-await': 'off', // 测试文件里 top-level await 是正常写法

      // 偏好类：不产生真实 bug，也不制造 diff
      'prefer-const': 'off',
      'prefer-template': 'off',
      'object-shorthand': 'off',
      'no-cond-assign': 'off', // 沿用旧配置：`while ((m = re.exec(s)))` 是惯用写法
      'no-lone-blocks': 'off', // `case 'x': { … }; break;` 的花括号是刻意的
      'unused-imports/no-unused-vars': 'off', // 未使用的函数参数多是签名占位

      // TS 风格类
      'ts/consistent-type-imports': 'off',
      'ts/consistent-type-definitions': 'off',
      'ts/no-use-before-define': 'off',
      'ts/ban-ts-comment': 'off',
      'ts/no-unused-expressions': 'off',
      'ts/no-explicit-any': 'off', // 动态入参/出参本来就无静态类型（见 README 的 any 说明）
    },
  }
)

// ESLint 9 的 rules 通配符（如 `perfectionist/*`）只在 global config 生效，这里手动关掉整组噪音规则
const NOISE_GROUPS = ['perfectionist/', 'jsdoc/', 'node/', 'import/']
for (const item of config) {
  if (!item.rules) {
    continue
  }
  for (const name of Object.keys(item.rules)) {
    if (NOISE_GROUPS.some((group) => name.startsWith(group))) {
      item.rules[name] = 'off'
    }
  }
}

export default config
