import { configDefaults, defineWorkspace } from "vitest/config";

const unitTests = [
  "tests/ai-context.test.ts",
  "tests/ai-parser.test.ts",
  "tests/ai-executor.test.ts",
  "tests/categories.test.ts",
  "tests/csv.test.ts",
  "tests/dates.test.ts",
  "tests/mail.test.ts",
  "tests/money.test.ts",
  "tests/origin.test.ts",
];

// Vitest 2.1 defines projects in a workspace file, not `test.projects`.
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      include: unitTests,
      globalSetup: [],
      setupFiles: [],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["tests/**/*.test.ts"],
      exclude: [...configDefaults.exclude, ...unitTests],
      globalSetup: ["./tests/global-setup.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  },
]);
