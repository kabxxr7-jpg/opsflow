import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Tenant isolation is enforced at the query layer (lib/db.ts) — but only for code that goes
// through it. These rules make going around it a lint error rather than a code-review judgment
// call: application code gets its database access from getScopedDb()/getOrgDb(), never from the
// raw client, and never from raw SQL (which would skip the scoping entirely).
const RAW_CLIENT_ALLOWED = [
  "lib/db.ts", // the scoping layer itself
  "app/login/actions.ts", // looks a user up before any session exists
  "app/api/cron/**", // enumerates organizations; runs per-org through getOrgDb()
  "app/api/integrations/**", // signature-verified machine callers with no browser session
  "prisma/seed.ts", // creates organizations and users
  "tests/**", // asserts on the raw rows to avoid trusting the code under test
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              importNames: ["rawDb"],
              message: "Use getScopedDb()/getOrgDb() so every query is tenant-scoped. rawDb is only for the files listed in eslint.config.mjs.",
            },
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Don't construct another client — it would bypass the org-scoping layer in lib/db.ts.",
            },
          ],
          // `paths` only matches the exact specifier, so "../../lib/db" would slip past it.
          patterns: [
            {
              group: ["**/lib/db", "**/lib/db.ts"],
              importNames: ["rawDb"],
              message: "Use getScopedDb()/getOrgDb() so every query is tenant-scoped, however the module is imported.",
            },
          ],
        },
      ],
    },
  },
  {
    files: RAW_CLIENT_ALLOWED,
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/db.ts", "tests/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]",
          message: "Raw SQL bypasses tenant scoping. Use the typed, org-scoped client.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
