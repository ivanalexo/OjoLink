import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dev-dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.wrangler/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    files: ["**/scripts/**", "packages/test-corpus/**", "apps/resolver/**"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/resolver/src/**"],
    rules: { "no-console": "error" },
  },
  {
    files: ["apps/web/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".svelte"] },
    },
  },
);
