#!/usr/bin/env node
// Export every table to CSV before a reset. Read-only: this script never writes to the database.
//
// Usage (from the repo root):   node scripts/backup-to-csv.mjs
// It asks for the Dashboard password (typed hidden, never saved), signs in, and writes one CSV per table to
// backups/<timestamp>/. The backups/ folder is git-ignored because it holds names and phone numbers.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request

// Tables that may hold data. Old-schema ones (transactions, materials) are skipped if they no longer exist.
const TABLES = ["people", "functions", "ledger_entries", "expense_entries", "income_entries", "transactions", "materials"];

// Reuse the site's own config so the URL, key and email are never copied by hand.
function readConfig() {
  const text = readFileSync(join(ROOT, "functions-dashboard", "supabase-config.js"), "utf8");
  const pick = (name) => {
    const match = text.match(new RegExp(`const ${name}\\s*=\\s*"([^"]+)"`));
    if (!match) throw new Error(`${name} not found in supabase-config.js`);
    return match[1];
  };
  return { url: pick("SUPABASE_URL"), key: pick("SUPABASE_ANON_KEY"), email: pick("DASHBOARD_EMAIL") };
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); }; // hide what is typed
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function signIn({ url, key, email }, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${body.msg || body.error_description || res.status}`);
  return body.access_token;
}

// Returns all rows of a table, or null if the table does not exist.
async function fetchTable({ url, key }, token, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${token}`, Range: `${from}-${from + PAGE_SIZE - 1}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

async function main() {
  const config = readConfig();
  const password = await askHidden(`Password for ${config.email}: `);
  const token = await signIn(config, password);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(ROOT, "backups", stamp);
  mkdirSync(dir, { recursive: true });

  console.log(`\nSaving to ${dir}\n`);
  for (const table of TABLES) {
    const rows = await fetchTable(config, token, table);
    if (rows === null) { console.log(`  ${table.padEnd(16)} (table not found, skipped)`); continue; }
    // "\uFEFF" (BOM) makes Excel open the Tamil text correctly instead of showing garbage.
    writeFileSync(join(dir, `${table}.csv`), "\uFEFF" + toCsv(rows), "utf8");
    console.log(`  ${table.padEnd(16)} ${String(rows.length).padStart(6)} rows`);
  }
  console.log("\nDone. Open the files and eyeball the row counts before we reset anything.");
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
