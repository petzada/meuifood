import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Fronteira do D1 (ADR 0006): fora de packages/db ninguém toca o D1 cru nem o Drizzle.
// Os apps recebem um FoodeDb por `createFoodeDb(env.DB)` (e o adapter do Better Auth por
// `createAuthDatabase(env.DB)`) e só operam com contexto de
// Loja/Ops emitido pelo pacote. Testes podem semear a fixture com `seedTwoStores(env.DB)`.
const D1_BOUNDARY_MESSAGE =
  "Acesso direto ao D1 é proibido fora de packages/db: use createFoodeDb(env.DB) e as operações com contexto de Loja (ADR 0006).";

const d1BoundaryImports = {
  patterns: [
    { group: ["drizzle-orm", "drizzle-orm/*"], message: D1_BOUNDARY_MESSAGE },
    { group: ["**/packages/db/**", "@foode/db/src/*"], message: D1_BOUNDARY_MESSAGE },
  ],
};

const d1BoundarySyntax = [
  {
    selector:
      "MemberExpression[property.name='DB']:not(CallExpression[callee.name=/^(createFoodeDb|createAuthDatabase|seedTwoStores|applyD1Migrations)$/] > MemberExpression)",
    message: D1_BOUNDARY_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name=/^(prepare|batch|withSession|dump)$/]",
    message: D1_BOUNDARY_MESSAGE,
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "reports/**",
      ".scratch/**",
      ".claude/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}", "**/*.config.ts", "scripts/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["apps/**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...d1BoundaryImports,
          patterns: [
            ...d1BoundaryImports.patterns,
            {
              group: ["@foode/db/testing"],
              message: "A fixture de teste só entra em arquivos *.test.ts.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...d1BoundarySyntax],
    },
  },
  {
    files: ["apps/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", d1BoundaryImports],
    },
  },
);
