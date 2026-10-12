import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // loadtest/.venv là môi trường Python cục bộ (đã .gitignore) — có bản Playwright JS bên trong.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "loadtest/.venv/**"]),
]);
