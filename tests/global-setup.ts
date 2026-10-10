import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  try {
    const load = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (load) load.call(process, path.join(root, ".env"));
  } catch {
    // .env is optional; the CI environment may provide variables directly.
  }
}

export function testDbUrl(): string {
  loadEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required to run the test suite (PostgreSQL, ?schema=test).");
  }
  if (!/[?&]schema=test\b/.test(url)) {
    throw new Error("Refusing to reset: TEST_DATABASE_URL must target a dedicated ?schema=test.");
  }
  return url;
}

export function setup() {
  const url = testDbUrl();
  execSync("npx prisma db push --skip-generate --force-reset", {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

export function teardown() {
  // The dedicated test schema is recreated at the start of every run.
}
