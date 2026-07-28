/**
 * Migra pvp_kill_logs do banco Lovable (antigo) → Supabase novo, em páginas.
 * Usa fetch/PostgREST (sem realtime) — compatível com Node 20.
 *
 * Pré-requisitos:
 * 1. pvp_matches já importado no banco novo (FK match_id)
 * 2. NEW_SUPABASE_SERVICE_ROLE_KEY do banco NOVO
 *
 * Uso (PowerShell):
 *   $env:NEW_SUPABASE_SERVICE_ROLE_KEY="sua_service_role"
 *   yarn migrate:kill-logs
 *
 * Opcional:
 *   $env:DRY_RUN="1"; yarn migrate:kill-logs
 *   $env:PAGE_SIZE="500"; yarn migrate:kill-logs
 */

const OLD_URL = (process.env.OLD_SUPABASE_URL || "https://piwvrencvdgngruhuxqw.supabase.co").replace(/\/+$/, "");
const OLD_KEY =
  process.env.OLD_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM";

const NEW_URL = (
  process.env.NEW_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://egupwrwzcuqazlshhfoq.supabase.co"
).replace(/\/+$/, "");
const NEW_SERVICE_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || "";

const PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000);
const DRY_RUN = process.env.DRY_RUN === "1";

if (!NEW_SERVICE_KEY) {
  console.error(`
Falta NEW_SUPABASE_SERVICE_ROLE_KEY.

No PowerShell:
  $env:NEW_SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
  yarn migrate:kill-logs

Pegue em: Supabase → egupwrwzcuqazlshhfoq → Project Settings → API → service_role
`);
  process.exit(1);
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function countRows(baseUrl, key) {
  const res = await fetch(`${baseUrl}/rest/v1/pvp_kill_logs?select=id`, {
    method: "HEAD",
    headers: headers(key, { Prefer: "count=exact" }),
  });
  if (!res.ok) {
    throw new Error(`count failed (${res.status}): ${await res.text()}`);
  }
  const range = res.headers.get("content-range"); // e.g. */128711
  const total = Number(range?.split("/")[1] ?? NaN);
  if (!Number.isFinite(total)) {
    throw new Error(`Não foi possível ler content-range: ${range}`);
  }
  return total;
}

async function fetchPage(from, to) {
  const res = await fetch(
    `${OLD_URL}/rest/v1/pvp_kill_logs?select=id,match_id,killer_name,victim_name,created_at&order=created_at.asc,id.asc`,
    {
      headers: headers(OLD_KEY, { Range: `${from}-${to}` }),
    }
  );
  if (!res.ok) {
    throw new Error(`fetch page failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function upsertBatch(rows) {
  if (DRY_RUN || rows.length === 0) return;
  const res = await fetch(`${NEW_URL}/rest/v1/pvp_kill_logs`, {
    method: "POST",
    headers: headers(NEW_SERVICE_KEY, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`upsert failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  console.log("Origem:", OLD_URL);
  console.log("Destino:", NEW_URL);
  console.log("PAGE_SIZE:", PAGE_SIZE, DRY_RUN ? "(DRY RUN)" : "");

  const total = await countRows(OLD_URL, OLD_KEY);
  console.log(`Total no Lovable: ${total} rows`);

  let migrated = 0;
  let from = 0;

  while (from < total) {
    const to = Math.min(from + PAGE_SIZE - 1, total - 1);
    const rows = await fetchPage(from, to);
    if (!rows.length) break;

    await upsertBatch(rows);
    migrated += rows.length;
    const pct = ((migrated / total) * 100).toFixed(1);
    console.log(`✓ ${migrated}/${total} (${pct}%)`);

    from += PAGE_SIZE;
  }

  const newCount = await countRows(NEW_URL, NEW_SERVICE_KEY);
  console.log("\nConcluído.");
  console.log(`Lovable: ${total} | Novo banco: ${newCount}`);
}

main().catch((err) => {
  console.error("\nErro:", err.message || err);
  process.exit(1);
});
