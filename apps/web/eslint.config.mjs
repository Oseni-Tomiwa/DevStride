import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  ...compat.extends("next/core-web-vitals", "next/typescript")
];

export default eslintConfig;
