import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "coverage/**", ".playwright-mcp/**"] },
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["app.ts", "ai-worker.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["server.ts", "build.ts", "*.test.ts", "eslint.config.ts"],
    languageOptions: { globals: globals.node },
  },
);
