/**
 * Development-only password reset for the four demo Auth accounts.
 *
 * Usage:
 *   ALLOW_DEMO_PASSWORD_RESET=1 DEMO_SEED_PASSWORD='...' npm run demo:reset-passwords
 *
 * Never prints passwords, service-role keys, DB URLs, or tokens.
 * Does not create users, alter profiles, or touch application data.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAILS = [
  "owner@demo.mobilepos.local",
  "admin@demo.mobilepos.local",
  "cashier@demo.mobilepos.local",
  "technician@demo.mobilepos.local",
];

function loadEnvFile() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

function assertGuards(env) {
  const allow =
    process.env.ALLOW_DEMO_PASSWORD_RESET === "1" ||
    env.ALLOW_DEMO_PASSWORD_RESET === "1";
  if (!allow) {
    throw new Error(
      "Refusing demo password reset. Set ALLOW_DEMO_PASSWORD_RESET=1. Development/demo only.",
    );
  }

  const nodeEnv = process.env.NODE_ENV || env.NODE_ENV || "";
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    ""
  ).toLowerCase();
  const looksProd =
    nodeEnv === "production" ||
    (appUrl.length > 0 &&
      !appUrl.includes("localhost") &&
      !appUrl.includes("127.0.0.1") &&
      !appUrl.includes(".local"));

  if (looksProd) {
    const override =
      process.env.ALLOW_DEMO_PASSWORD_RESET_IN_PRODUCTION === "1" ||
      env.ALLOW_DEMO_PASSWORD_RESET_IN_PRODUCTION === "1";
    if (!override) {
      throw new Error(
        "Refusing demo password reset against a production-like environment. Set ALLOW_DEMO_PASSWORD_RESET_IN_PRODUCTION=1 only for an intentional exception.",
      );
    }
  }

  const password = process.env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error(
      "DEMO_SEED_PASSWORD is required (min 10 chars). Do not commit passwords to source.",
    );
  }
  return password;
}

async function findUserByEmail(admin, email) {
  // Prefer listUsers scan over create — exact email match only.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users || [];
    const match = users.find((u) => u.email === email);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

async function main() {
  const fileEnv = loadEnvFile();
  const env = { ...fileEnv, ...process.env };
  const password = assertGuards(env);

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
    );
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let failures = 0;
  for (const email of DEMO_EMAILS) {
    const user = await findUserByEmail(admin, email);
    if (!user) {
      console.log(`${email}: missing (not created)`);
      failures += 1;
      continue;
    }

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.log(`${email}: reset failed`);
      failures += 1;
      continue;
    }
    console.log(`${email}: password reset`);
  }

  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
