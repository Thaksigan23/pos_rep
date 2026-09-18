import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const password = "Phase4-Test-Passw0rd!";

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(email, firstName) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.users.find((user) => user.email === email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName },
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || "sign-in failed");
  return client;
}

const owner = await ensureUser("phase4.owner@example.com", "Owner");
const adminUser = await ensureUser("phase4.admin@example.com", "Admin");
const cashier = await ensureUser("phase4.cashier@example.com", "Cashier");
const tech = await ensureUser("phase4.tech@example.com", "Technician");
await ensureUser("phase4.onboard@example.com", "NewOwner");

const ownerClient = await signIn(owner.email);
const { data: profile } = await ownerClient.from("profiles").select("organization_id, default_shop_id").eq("id", owner.id).maybeSingle();
if (!profile?.organization_id) {
  const boot = await ownerClient.rpc("bootstrap_organization", { p_name: "Phase4 Demo Shop" });
  if (boot.error) throw boot.error;
}

const { data: shop } = await ownerClient.from("shops").select("id").limit(1).single();
for (const [user, role] of [
  [adminUser, "admin"],
  [cashier, "cashier"],
  [tech, "technician"],
]) {
  const assigned = await ownerClient.rpc("assign_staff_profile", {
    p_user_id: user.id,
    p_role: role,
    p_shop_id: shop.id,
    p_first_name: role,
  });
  if (assigned.error) console.error(role, assigned.error.message);
  else console.log("assigned", role);
}

console.log("ready");
