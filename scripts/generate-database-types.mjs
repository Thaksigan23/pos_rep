import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { introspect } from "@supabase/postgrest-typegen/introspection";
import { generateTypescript, sortGeneratorMetadata } from "@supabase/postgrest-typegen/generation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvSync(filePath) {
  const parsed = {};
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return parsed;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    parsed[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return parsed;
}

const env = { ...process.env, ...loadEnvSync(path.join(root, ".env.local")) };
const connectionString = env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to generate types.");
}

const url = new URL(connectionString);
url.searchParams.delete("sslmode");

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

try {
  const metadata = await introspect(pool, { includedSchemas: ["public"] });
  const types = await generateTypescript(sortGeneratorMetadata(metadata), {
    postgrestVersion: "13",
  });
  mkdirSync(path.join(root, "types"), { recursive: true });
  writeFileSync(path.join(root, "types", "database.ts"), types.endsWith("\n") ? types : `${types}\n`, "utf8");
  console.log("Wrote types/database.ts from live public schema.");
} finally {
  await pool.end();
}
