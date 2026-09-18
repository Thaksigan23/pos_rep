import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
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

const fileEnv = loadEnvFile(path.join(root, ".env.local"));
const env = { ...process.env, ...fileEnv };
const projectRef =
  env.SUPABASE_PROJECT_REF ||
  (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];

function hasSecret(name) {
  return Boolean(env[name] && String(env[name]).length > 0);
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && command !== process.execPath,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function redact(text) {
  return String(text || "")
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "[redacted-db-url]")
    .replace(/sbp_[A-Za-z0-9_]+/g, "[redacted-token]")
    .replace(/sb_secret_[A-Za-z0-9_]+/g, "[redacted-secret]")
    .replace(/sb_publishable_[A-Za-z0-9_]+/g, "[redacted-publishable]");
}

async function main() {
  const mode = process.argv[2] || "push";
  if (!projectRef) {
    throw new Error("Missing project ref. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_REF.");
  }

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  let result;

  if (mode === "push") {
    console.log(`Applying migrations to project ${projectRef} (secrets not logged).`);
    if (hasSecret("DATABASE_URL")) {
      result = await run(npx, ["supabase", "db", "push", "--yes", "--include-all", "--db-url", env.DATABASE_URL]);
    } else if (hasSecret("SUPABASE_ACCESS_TOKEN")) {
      const extra = { SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN };
      if (hasSecret("SUPABASE_DB_PASSWORD")) extra.PGPASSWORD = env.SUPABASE_DB_PASSWORD;
      const args = ["supabase", "db", "push", "--yes", "--include-all", "--project-ref", projectRef];
      if (hasSecret("SUPABASE_DB_PASSWORD")) args.push("--password", env.SUPABASE_DB_PASSWORD);
      result = await run(npx, args, extra);
    } else {
      throw new Error(
        "No DATABASE_URL or SUPABASE_ACCESS_TOKEN found in the environment or .env.local.",
      );
    }
  } else if (mode === "types") {
    console.log(`Generating types/database.ts from project ${projectRef}.`);
    if (hasSecret("DATABASE_URL")) {
      result = await run(process.execPath, [path.join("scripts", "generate-database-types.mjs")]);
      process.stdout.write(redact(result.stdout));
      process.stderr.write(redact(result.stderr));
      if (result.code !== 0) {
        process.exitCode = result.code || 1;
      }
      return;
    }
    const args = ["supabase", "gen", "types", "typescript", "--schema", "public"];
    const extra = {};
    extra.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
    args.push("--project-id", projectRef);
    result = await run(npx, args, extra);
    if (result.code === 0) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(path.join(root, "types"), { recursive: true });
      writeFileSync(path.join(root, "types", "database.ts"), result.stdout, "utf8");
      console.log("Wrote types/database.ts");
      return;
    }
  } else {
    throw new Error(`Unknown mode ${mode}`);
  }

  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.code !== 0) {
    process.exitCode = result.code || 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
