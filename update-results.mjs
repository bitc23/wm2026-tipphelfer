#!/usr/bin/env node
/* Holt d offiziellschte WM-2026-Resultat vo football-data.org und schriibt results.json.
   Lauft täglich im GitHub-Action (.github/workflows/update-results.yml);
   manuell: FOOTBALL_DATA_TOKEN=xxx node update-results.mjs

   results.json wird vom index.html bim Lade gholt: d Beta-Tester müend so
   kei Resultat meh vo Hand iitrage — nu no ihri eigete Tipps. */
import { readFileSync, writeFileSync } from "node:fs";

const API_URL = "https://api.football-data.org/v4/competitions/WC/matches";
const OUT_FILE = new URL("./results.json", import.meta.url);
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const SCORE_MIN = 0, SCORE_MAX = 30;

// App-Team-Key -> alli Schribwiise, wo d API für das Team bruche chönnt.
// (football-data.org bruucht z.B. "Korea Republic" statt "South Korea".)
// D Schlüssel müend exakt de Key vo T{} im index.html entspräche.
const ALIASES = {
  Mexico: ["Mexico"],
  SouthAfrica: ["South Africa"],
  SouthKorea: ["South Korea", "Korea Republic", "Republic of Korea"],
  Czechia: ["Czechia", "Czech Republic"],
  Canada: ["Canada"],
  Switzerland: ["Switzerland"],
  Qatar: ["Qatar"],
  Bosnia: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia & Herzegovina"],
  Brazil: ["Brazil"],
  Morocco: ["Morocco"],
  Haiti: ["Haiti"],
  Scotland: ["Scotland"],
  USA: ["United States", "USA", "United States of America"],
  Australia: ["Australia"],
  Paraguay: ["Paraguay"],
  Turkiye: ["Türkiye", "Turkiye", "Turkey"],
  Germany: ["Germany"],
  Curacao: ["Curaçao", "Curacao"],
  IvoryCoast: ["Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast"],
  Ecuador: ["Ecuador"],
  Netherlands: ["Netherlands"],
  Japan: ["Japan"],
  Sweden: ["Sweden"],
  Tunisia: ["Tunisia"],
  Belgium: ["Belgium"],
  Egypt: ["Egypt"],
  Iran: ["Iran", "IR Iran", "Islamic Republic of Iran"],
  NewZealand: ["New Zealand"],
  Spain: ["Spain"],
  CapeVerde: ["Cape Verde", "Cabo Verde"],
  SaudiArabia: ["Saudi Arabia"],
  Uruguay: ["Uruguay"],
  France: ["France"],
  Senegal: ["Senegal"],
  Iraq: ["Iraq"],
  Norway: ["Norway"],
  Argentina: ["Argentina"],
  Algeria: ["Algeria"],
  Austria: ["Austria"],
  Jordan: ["Jordan"],
  Portugal: ["Portugal"],
  DRCongo: ["DR Congo", "Congo DR", "Democratic Republic of the Congo", "Congo, DR"],
  Uzbekistan: ["Uzbekistan"],
  Colombia: ["Colombia"],
  England: ["England"],
  Croatia: ["Croatia"],
  Ghana: ["Ghana"],
  Panama: ["Panama"]
};

// Name normalisiere (Akzänt, Gross-/Chliischrift, Interpunktion ewägg), damit
// chliini Schribwiise-Unterschiede nöd alles uf d Nase legged.
function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");
}
const KEY_BY_NORM = new Map();
for (const [key, names] of Object.entries(ALIASES)) {
  for (const n of names) KEY_BY_NORM.set(norm(n), key);
}
function teamKey(name) { return KEY_BY_NORM.get(norm(name)) || null; }

// football-data.org-Stage -> isch es es K.o.-Spiel? (alles usser Gruppephase)
function isKnockout(stage) { return stage && stage !== "GROUP_STAGE"; }

function pairKey(a, b, ko) {
  return [a, b].sort().join("|") + "|" + (ko ? "ko" : "grp");
}

function validScore(n) {
  return Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX;
}

async function fetchMatches() {
  const res = await fetch(API_URL, {
    headers: { "X-Auth-Token": TOKEN },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) {
    throw new Error(`football-data.org: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.matches)) {
    throw new Error("football-data.org: unerwartets Antwort-Format (kei matches[])");
  }
  return data.matches;
}

function buildResults(matches) {
  const results = {}, unknown = new Set(), skipped = [];
  for (const m of matches) {
    const status = m.status;
    // Nu fertig gspilti Spiel mit gültigem Schluss-Resultat übernäh.
    if (status !== "FINISHED") continue;
    const ft = m.score && m.score.fullTime;
    if (!ft || !validScore(ft.home) || !validScore(ft.away)) {
      skipped.push(`Spiel ${m.id}: kei gültigs Schluss-Resultat`);
      continue;
    }
    const homeName = m.homeTeam && m.homeTeam.name;
    const awayName = m.awayTeam && m.awayTeam.name;
    const home = teamKey(homeName), away = teamKey(awayName);
    if (!home) { unknown.add(homeName); continue; }
    if (!away) { unknown.add(awayName); continue; }

    const ko = isKnockout(m.stage);
    const entry = { home, hs: ft.home, as: ft.away };

    // Penalty-Entscheidig (nu im K.o. relevant): wer chunnt witer?
    if (ko) {
      const pen = m.score && m.score.penalties;
      if (pen && validScore(pen.home) && validScore(pen.away) && pen.home !== pen.away) {
        entry.pens = pen.home > pen.away ? "home" : "away";
      } else if (ft.home === ft.away && m.score && m.score.winner) {
        // Unentschiede noch regulärer Ziit, aber e Sieger isch gsetzt (Penalty/Verlängerig)
        if (m.score.winner === "HOME_TEAM") entry.pens = "home";
        else if (m.score.winner === "AWAY_TEAM") entry.pens = "away";
      }
    }

    results[pairKey(home, away, ko)] = entry;
  }
  return { results, unknown: [...unknown], skipped };
}

function logDiff(results) {
  let old = null;
  try { old = JSON.parse(readFileSync(OUT_FILE, "utf8")).results; } catch (e) { /* no kei results.json */ }
  if (!old) { console.log("results.json wird neu erstellt"); return; }
  const keys = new Set([...Object.keys(old), ...Object.keys(results)]);
  let changes = 0;
  for (const k of keys) {
    const a = old[k], b = results[k];
    const sa = a ? `${a.home} ${a.hs}:${a.as}${a.pens ? " (P:" + a.pens + ")" : ""}` : "—";
    const sb = b ? `${b.home} ${b.hs}:${b.as}${b.pens ? " (P:" + b.pens + ")" : ""}` : "—";
    if (sa !== sb) { console.log(`${k}: ${sa} -> ${sb}`); changes++; }
  }
  if (!changes) console.log("Kei Änderige sit em letschte Lauf");
}

if (!TOKEN) {
  console.error("FOOTBALL_DATA_TOKEN fählt — gratis Token uf football-data.org/client/register hole\n" +
    "und als GitHub-Secret FOOTBALL_DATA_TOKEN hinterlege.");
  process.exit(1);
}

const matches = await fetchMatches();
const { results, unknown, skipped } = buildResults(matches);

if (unknown.length) {
  // Es unmappts Team isch e ächte Mappig-Lücke -> abbräche, statt e halbe Stand schriibe,
  // damit de Maintainer en Alias chan nochetrage (ALIASES{} obe).
  console.error("Unbekannti Team-Name vo de API (Alias i update-results.mjs ergänze):\n  " +
    unknown.join("\n  "));
  process.exit(1);
}
if (skipped.length) skipped.forEach(s => console.warn(s));

logDiff(results);
const sorted = {};
for (const k of Object.keys(results).sort()) sorted[k] = results[k];
const out = {
  updated: new Date().toISOString().slice(0, 10),
  source: "football-data.org",
  results: sorted
};
writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + "\n");
console.log(`results.json aktualisiert (${Object.keys(sorted).length} gspilti Spiel)`);
