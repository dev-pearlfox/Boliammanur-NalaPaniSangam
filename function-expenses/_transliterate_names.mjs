#!/usr/bin/env node
// One-shot Tamil → English transliteration for the `people.name_en` column.
//
// - Only touches rows where name_en is null/empty (never overwrites existing).
// - Keeps English initials (S., ST., etc.) as-is.
// - Dry-run first: prints the full Tamil → English mapping and waits for
//   an explicit "YES" before writing anything.
//
// Run:
//   node _transliterate_names.mjs
//
// Uses only Node 18+'s built-in fetch — no npm install needed.

import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";

// ---------------------- config from supabase-config.js ----------------------

const configText = readFileSync(new URL("./supabase-config.js", import.meta.url), "utf8");
const pick = (name) => {
  const m = configText.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  if (!m) throw new Error(`Couldn't find ${name} in supabase-config.js`);
  return m[1];
};
const SUPABASE_URL = pick("SUPABASE_URL");
const SUPABASE_ANON_KEY = pick("SUPABASE_ANON_KEY");
const ADMIN_EMAIL = pick("ADMIN_EMAIL");

// ---------------------- Tamil → Roman transliteration ----------------------

// Standalone vowels (word-start or after another vowel). Long e/i/u/o
// collapse to their short equivalents ("e" not "ae", "i" not "ee") — that
// matches how Tamil names are actually spelled in English (Venkatesan,
// Ravi, Kumar, Ramesh) rather than a strict phonetic distinction.
const VOWELS = {
  "அ": "a",  "ஆ": "a",  "இ": "i",  "ஈ": "i",  "உ": "u",  "ஊ": "u",
  "எ": "e",  "ஏ": "e",  "ஐ": "ai", "ஒ": "o",  "ஓ": "o",  "ஔ": "au",
};

// Vowel signs (matras) that combine with a preceding consonant. Same
// short/long collapse as VOWELS above.
const VOWEL_SIGNS = {
  "ா": "a",  "ி": "i",  "ீ": "i",  "ு": "u",  "ூ": "u",
  "ெ": "e",  "ே": "e",  "ை": "ai", "ொ": "o",  "ோ": "o",  "ௌ": "au",
};

// Consonants — a single sound per key. This uses the modern name-Roman
// convention (ப→B, க→K, ச→S, த→Th, ட→D), which is what people expect for
// Tamil names in an English column. Aspirated/soft variants (P/G/Ch/Dh)
// are all valid too — post-editing in the UI catches any exceptions.
const CONSONANTS = {
  "க": "k",  "ங": "ng", "ச": "s",  "ஞ": "nj", "ட": "d",
  "ண": "n",  "த": "th", "ந": "n",  "ன": "n",  "ப": "b",
  "ம": "m",  "ய": "y",  "ர": "r",  "ற": "r",  "ல": "l",
  "ள": "l",  "ழ": "zh", "வ": "v",  "ஸ": "s",  "ஹ": "h",
  "ஷ": "sh", "ஜ": "j",  "ஶ": "sh",
};

const PULLI = "்"; // virama / halant — silences the consonant's implicit vowel

// Ranges to detect Tamil script characters (for word-boundary tracking).
const isTamil = (ch) => {
  const c = ch.codePointAt(0);
  return c >= 0x0B80 && c <= 0x0BFF;
};

function transliterateWord(word) {
  let out = "";
  let i = 0;
  while (i < word.length) {
    const ch = word[i];

    if (VOWELS[ch]) {
      out += VOWELS[ch];
      i++;
      continue;
    }

    if (CONSONANTS[ch]) {
      const cons = CONSONANTS[ch];
      const next = word[i + 1];
      if (next === PULLI) {
        out += cons; // no vowel — end of syllable / cluster start
        i += 2;
      } else if (VOWEL_SIGNS[next]) {
        out += cons + VOWEL_SIGNS[next];
        i += 2;
      } else {
        out += cons + "a"; // implicit inherent 'a'
        i++;
      }
      continue;
    }

    // Anything else (rare — punctuation inside a Tamil word) — keep as-is.
    out += ch;
    i++;
  }
  return applyNameConventions(out);
}

// Post-processing tweaks that fix the systematic gap between literal
// character-by-character output and how Tamil names are actually spelled
// in English. Each rule is a real convention, not a guess — applied in
// order so earlier fixes feed the later ones.
function applyNameConventions(word) {
  return word
    // ங் + க (ngk before a vowel) is written as just "ng" in English names:
    // தங்கராஜ் = Thangaraj (not Thangkaraj), வெங்கடேசன் = Vengadesan.
    .replace(/ngk([aeiou])/g, "ng$1")
    // Intervocalic க softens to "g": முருகன் = Murugan (not Murukan).
    // Only softens when sandwiched between two vowels, so word-initial க
    // (Kumar, Kavitha) and post-consonant க (Karthik) keep their hard "k".
    // Trade-off: compound names like சிவகுமார் collapse to Sivagumar
    // instead of Sivakumar — auto-detecting the "Kumar" boundary requires
    // a name dictionary. Fix in the UI after if needed.
    .replace(/([aeiou])k([aeiou])/g, "$1g$2")
    // Double-th (from த்+த: geminate த) reduces to single "th" in name
    // English: கார்த்திக் = Karthik (not Karththik), கீர்த்தி = Keerthi.
    // The Tamil geminate is still audible when pronounced, but the
    // conventional Roman spelling drops the doubling.
    .replace(/thth/g, "th");
}

// Split on whitespace, transliterate Tamil chunks, leave ASCII chunks
// (initials like "S.", "ST.") untouched, then title-case each word so the
// output looks like a normal English name column.
function transliterate(fullName) {
  if (!fullName) return fullName;
  return fullName
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk) || !chunk) return chunk;
      // Pure ASCII chunk (e.g. "S.", "ST.", "R.B.", "Jr") — leave alone.
      const hasTamil = [...chunk].some(isTamil);
      if (!hasTamil) return chunk;
      const romanized = transliterateWord(chunk);
      // Title-case: uppercase first letter, lowercase the rest.
      return romanized.charAt(0).toUpperCase() + romanized.slice(1).toLowerCase();
    })
    .join("");
}

// ---------------------- Supabase REST helpers ----------------------

async function signIn(password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`Sign-in failed: ${body.msg || JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function fetchPeople(jwt) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/people?select=id,name,name_en,member_no&order=member_no.asc`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } }
  );
  if (!res.ok) throw new Error(`Fetch failed: ${await res.text()}`);
  return res.json();
}

async function updateNameEn(jwt, id, nameEn) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/people?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ name_en: nameEn }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ---------------------- Main flow ----------------------

async function main() {
  const rl = createInterface({ input, output });

  const password = await rl.question(`Password for ${ADMIN_EMAIL}: `);

  console.log("\n Signing in...");
  const jwt = await signIn(password);
  console.log(" Signed in.\n");

  console.log(" Fetching people...");
  const all = await fetchPeople(jwt);
  // Client-side filter: name_en null, empty, or whitespace-only.
  const candidates = all.filter((p) => !p.name_en || !p.name_en.trim());

  if (candidates.length === 0) {
    console.log(" Every person already has an English name — nothing to do!");
    rl.close();
    return;
  }

  const proposals = candidates
    .filter((p) => p.name && p.name.trim())
    .map((p) => ({
      id: p.id,
      member_no: p.member_no,
      tamil: p.name.trim(),
      english: transliterate(p.name.trim()),
    }));

  const skipped = candidates.length - proposals.length;

  console.log(`\nFound ${proposals.length} candidates` + (skipped ? ` (${skipped} skipped — no Tamil name to transliterate)` : "") + ":\n");
  console.log("S.No | Tamil name  →  English (proposed)");
  console.log("─────┼" + "─".repeat(70));
  proposals.forEach((p) => {
    console.log(`${String(p.member_no ?? "-").padStart(4)} | ${p.tamil.padEnd(30)} →  ${p.english}`);
  });
  console.log("");

  const answer = await rl.question(`Apply these ${proposals.length} updates? Type YES to proceed: `);
  if (answer.trim() !== "YES") {
    console.log(" Aborted — no changes made.");
    rl.close();
    return;
  }

  console.log("\n Applying...");
  let ok = 0;
  let fail = 0;
  for (const p of proposals) {
    try {
      await updateNameEn(jwt, p.id, p.english);
      ok++;
      console.log(`   ${p.tamil} → ${p.english}`);
    } catch (err) {
      fail++;
      console.log(`   ${p.tamil}: ${err.message}`);
    }
  }

  console.log(`\n Done! ${ok} updated, ${fail} failed.`);
  rl.close();
}

main().catch((err) => {
  console.error("\n", err.message);
  process.exit(1);
});
