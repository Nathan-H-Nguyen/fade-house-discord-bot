import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/", "coverage/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
  },
  {
    files: ["src/**", "test/**"],
    rules: {
      // The production token must only ever reach the bot through DISCORD_TOKEN.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/PROD_DISCORD_TOKEN/], Identifier[name='PROD_DISCORD_TOKEN']",
          message: "Read DISCORD_TOKEN only; never PROD_DISCORD_TOKEN.",
        },
      ],
    },
  },
  prettier,
);
