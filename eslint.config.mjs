// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  
  // This option is purely so I can use console.log().
  {
      languageOptions: {
          globals: {
              ...globals.node,
          }
      }
  }
);
