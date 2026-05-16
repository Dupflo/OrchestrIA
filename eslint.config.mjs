import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // eslint-plugin-react-hooks v6 ships the React Compiler rule set
      // enabled by default. The force-directed graph and animation hooks
      // (useForceLayout, useTraffic) deliberately use ref/mutation patterns
      // for performance, and this project does not adopt the React Compiler.
      // Keep these advisory rather than contort working code into compiler
      // shape; revisit (and flip back to "error") if/when the compiler is
      // adopted.
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Allow the idiomatic "intentionally unused, underscore-prefixed"
      // convention (e.g. `const { source: _src, ...rest } = obj`).
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
