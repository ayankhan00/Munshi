import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function testDbFile(): string {
  return path.resolve(__dirname, "../prisma/test.db");
}

export function testDbUrl(): string {
  return `file:${testDbFile().replace(/\\/g, "/")}`;
}

export function setup() {
  const dbFile = testDbFile();
  for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  execSync("npx prisma db push --skip-generate --force-reset", {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: testDbUrl() },
  });
}

export function teardown() {
  const dbFile = testDbFile();
  for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
