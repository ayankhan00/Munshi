import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const load = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (load) load.call(process, path.join(root, ".env"));
} catch {
  // .env is optional; the CI environment may provide variables directly.
}

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/[?&]schema=test\b/.test(testUrl)) {
  throw new Error("TEST_DATABASE_URL with ?schema=test is required to run tests.");
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
process.env.DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? "Asia/Karachi";
