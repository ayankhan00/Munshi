import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, "../prisma/test.db").replace(/\\/g, "/");

process.env.DATABASE_URL = `file:${dbFile}`;
process.env.DEFAULT_TIMEZONE = "Asia/Karachi";
