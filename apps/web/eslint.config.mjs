import { globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // These stricter React compiler diagnostics are not enabled by the
    // previous Next.js 15 toolchain and are outside this dependency upgrade.
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
