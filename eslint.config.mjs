// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.cjs", "tests/**/*.cjs"],
  },

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript ESLint recommended
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript-specific settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Source files configuration
  {
    files: ["src/**/*.ts"],
    rules: {
      // Allow console for logging (this is a CLI/server app)
      "no-console": "off",

      // TypeScript specific
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "off",

      // Relax some strict rules for pragmatic development (code was originally JS)
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },

  // Test files configuration
  {
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      // More relaxed rules for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  // Scripts configuration
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
