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
  CapeVerde: ["Cape Verde", "Cape Verde Islands", "Cabo Verde"],
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

// ===== K.O.-Bracket: feed-authoritative Mappig vo R32 =====
// Sobald de FIFA-Draw publiziert isch, schriibed mer ko_pairs:{id:{a,b}} ind results.json,
// demit index.html nöd uf di internalisierti Standings-Tiebreaker-Logik agwiesen isch
// (sit P/GD/GF/Elo divergiere chönd vo de offizielle FIFA-Tiebreakers).
// Mues 1:1 mit em T[]-Gruppe-Feld vo index.html überiistimme.
const TEAM_GROUP = {
  Mexico:"A", SouthAfrica:"A", SouthKorea:"A", Czechia:"A",
  Canada:"B", Switzerland:"B", Qatar:"B", Bosnia:"B",
  Brazil:"C", Morocco:"C", Haiti:"C", Scotland:"C",
  USA:"D", Australia:"D", Paraguay:"D", Turkiye:"D",
  Germany:"E", Curacao:"E", IvoryCoast:"E", Ecuador:"E",
  Netherlands:"F", Japan:"F", Sweden:"F", Tunisia:"F",
  Belgium:"G", Egypt:"G", Iran:"G", NewZealand:"G",
  Spain:"H", CapeVerde:"H", SaudiArabia:"H", Uruguay:"H",
  France:"I", Senegal:"I", Iraq:"I", Norway:"I",
  Argentina:"J", Algeria:"J", Austria:"J", Jordan:"J",
  Portugal:"K", DRCongo:"K", Uzbekistan:"K", Colombia:"K",
  England:"L", Croatia:"L", Ghana:"L", Panama:"L"
};

// R32-Slot-Constraints, abgleitet vom KO[]-Array im index.html.
// Jeder Slot het: groups = erlaubti Gruppe(n), pos = erforderlichi Gruppe-Position
//   ("W" = Sieger, "R" = Zwöiti, "3" = 3.-Platzierti).
// Mit Position-Info werded alli 16 R32-Slot eindütig — ohni Position-Info chönd
// es paar ({F,C}-style) zwöideutig si und falled denn uf resolveSlot zrugg.
const KO_R32 = [
  { id:73, a:{ groups:"A",     pos:"R" }, b:{ groups:"B",     pos:"R" } },
  { id:74, a:{ groups:"E",     pos:"W" }, b:{ groups:"ABCDF", pos:"3" } },
  { id:75, a:{ groups:"F",     pos:"W" }, b:{ groups:"C",     pos:"R" } },
  { id:76, a:{ groups:"C",     pos:"W" }, b:{ groups:"F",     pos:"R" } },
  { id:77, a:{ groups:"I",     pos:"W" }, b:{ groups:"CDFGH", pos:"3" } },
  { id:78, a:{ groups:"E",     pos:"R" }, b:{ groups:"I",     pos:"R" } },
  { id:79, a:{ groups:"A",     pos:"W" }, b:{ groups:"CEFHI", pos:"3" } },
  { id:80, a:{ groups:"L",     pos:"W" }, b:{ groups:"EHIJK", pos:"3" } },
  { id:81, a:{ groups:"D",     pos:"W" }, b:{ groups:"BEFIJ", pos:"3" } },
  { id:82, a:{ groups:"G",     pos:"W" }, b:{ groups:"AEHIJ", pos:"3" } },
  { id:83, a:{ groups:"K",     pos:"R" }, b:{ groups:"L",     pos:"R" } },
  { id:84, a:{ groups:"H",     pos:"W" }, b:{ groups:"J",     pos:"R" } },
  { id:85, a:{ groups:"B",     pos:"W" }, b:{ groups:"EFGIJ", pos:"3" } },
  { id:86, a:{ groups:"J",     pos:"W" }, b:{ groups:"H",     pos:"R" } },
  { id:87, a:{ groups:"K",     pos:"W" }, b:{ groups:"DEIJL", pos:"3" } },
  { id:88, a:{ groups:"D",     pos:"R" }, b:{ groups:"G",     pos:"R" } }
];

function teamFitsSlot(slot, teamGroup, teamPos) {
  if (!slot.groups.includes(teamGroup)) return false;
  if (teamPos != null && teamPos !== slot.pos) return false;  // streng, wenn Position bekannt
  return true;
}

// Mit Positions={teamKey: "W"|"R"|"3"|"4"} sind alli R32-Slot eindütig zueordebar.
// Ohni: nu die Slot, wo s Gruppe-Paar eindütig isch (10 vo 16).
function mapKoR32(homeKey, awayKey, positions) {
  const gH = TEAM_GROUP[homeKey], gA = TEAM_GROUP[awayKey];
  if (!gH || !gA) return null;
  const pH = positions ? positions[homeKey] : null;
  const pA = positions ? positions[awayKey] : null;
  const candidates = new Map();
  for (const s of KO_R32) {
    if (teamFitsSlot(s.a, gH, pH) && teamFitsSlot(s.b, gA, pA))
      candidates.set(`${s.id}|${homeKey}|${awayKey}`, { id: s.id, a: homeKey, b: awayKey });
    if (teamFitsSlot(s.a, gA, pA) && teamFitsSlot(s.b, gH, pH))
      candidates.set(`${s.id}|${awayKey}|${homeKey}`, { id: s.id, a: awayKey, b: homeKey });
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

// Holt offizielli Gruppestandig vo football-data.org und git e {teamKey: "W"/"R"/"3"/"4"}-
// Map zrugg. Bi Fähler/Antwortprobläm: null (mapKoR32 fallt denn uf gruppe-only-Modus zrugg).
async function fetchStandings() {
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/standings", {
      headers: { "X-Auth-Token": TOKEN },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) { console.warn(`Standings: HTTP ${res.status} — KO-Mappig nur eindütig`); return null; }
    const data = await res.json();
    if (!data || !Array.isArray(data.standings)) { console.warn("Standings: unerwartets Format"); return null; }
    const positions = {};
    for (const grp of data.standings) {
      if (grp.stage !== "GROUP_STAGE" || grp.type !== "TOTAL" || !Array.isArray(grp.table)) continue;
      for (const row of grp.table) {
        const name = row.team && row.team.name;
        const key = teamKey(name);
        if (!key) continue;
        if (row.position === 1) positions[key] = "W";
        else if (row.position === 2) positions[key] = "R";
        else if (row.position === 3) positions[key] = "3";
        else positions[key] = "4";
      }
    }
    return positions;
  } catch (e) {
    console.warn(`Standings: ${e.message} — KO-Mappig nur eindütig`);
    return null;
  }
}

// Sammli alli LAST_32-Spiel us de API (au nonig gspilti) und füll ko_pairs.
function buildKoPairs(matches, positions) {
  const pairs = {};
  const ambiguous = [];
  for (const m of matches) {
    if (m.stage !== "LAST_32") continue;
    const homeName = m.homeTeam && m.homeTeam.name;
    const awayName = m.awayTeam && m.awayTeam.name;
    if (!homeName || !awayName) continue;  // Draw nonig confirmiert -> Platzhalter ignoriere
    const home = teamKey(homeName), away = teamKey(awayName);
    if (!home || !away) continue;  // Unbekannti Name werded scho i buildResults gflaggt
    const mapped = mapKoR32(home, away, positions);
    if (mapped) pairs[mapped.id] = { a: mapped.a, b: mapped.b };
    else ambiguous.push(`${homeName} vs ${awayName} (Gruppe ${TEAM_GROUP[home] || "?"}/${TEAM_GROUP[away] || "?"})`);
  }
  return { pairs, ambiguous };
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

// ===== Modell-Tipp iifriere (gliichi Logik wie de Mänsch: Tipp zue 5 Min vor Aapfiff) =====
// De Modell-Tipp hänkt nu vo de Elo ab; d Elo wird täglich am Morge aktualisiert und
// zwüsche Morge-Update und Aapfiff passiert nüt. Drum: bi jedem Lauf de Tipp vo allne no
// OFFENE Gruppespiel mit de aktuelle Elo neu setze; gschlosseni (Aapfiff-5Min verbii) werded
// nüm aagrührt -> ihre Tipp isch iigfrore, genau wie bim Mänsch (kei Look-ahead über d Elo).
// S Modell läbt im index.html; mer läse Spielplan + Kalibrierig vo dört, damit nüt drift.
const INDEX_FILE = new URL("./index.html", import.meta.url);
const ELO_FILE = new URL("./elo.json", import.meta.url);
const LOCK_MS = 5 * 60000;
let MU, GAMMA, MAXG, RHO;

function pois(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function tipFromRatings(rh, ra) {  // 1:1 wie analyse()/lambdas() im index.html
  const d = rh - ra;
  const lh = Math.max(0.05, Math.min(4.0, MU * Math.exp(GAMMA * d)));
  const la = Math.max(0.05, Math.min(4.0, MU * Math.exp(-GAMMA * d)));
  const m = []; let sum = 0;
  for (let i = 0; i <= MAXG; i++) { m[i] = []; for (let j = 0; j <= MAXG; j++) {
    let p = pois(lh, i) * pois(la, j), tau = 1;
    if (i === 0 && j === 0) tau = 1 - lh * la * RHO; else if (i === 0 && j === 1) tau = 1 + lh * RHO;
    else if (i === 1 && j === 0) tau = 1 + la * RHO; else if (i === 1 && j === 1) tau = 1 - RHO;
    p *= Math.max(0.0001, tau); m[i][j] = p; sum += p;
  } }
  let eh = 0, ea = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { const p = m[i][j] / sum; eh += i * p; ea += j * p; }
  let tH = Math.round(eh), tA = Math.round(ea); const diff = eh - ea;
  if (diff >= 0.5 && tH <= tA) tH = tA + 1; else if (-diff >= 0.5 && tA <= tH) tA = tH + 1;
  return [tH, tA];
}
function readCalibration(html) {
  const a = /const MU=([\d.]+)\s*,\s*GAMMA=([\d.]+)/.exec(html);
  const b = /const MAXG=(\d+)\s*,\s*RHO=(-?[\d.]+)/.exec(html);
  if (!a || !b) throw new Error("Modell-Konstante (MU/GAMMA/MAXG/RHO) nöd im index.html gfunde");
  MU = +a[1]; GAMMA = +a[2]; MAXG = +b[1]; RHO = +b[2];
}
function extractFixtures(html) {  // d Gruppespiel-Liste (const M=[...]) us index.html
  const m = html.match(/const M=\[([\s\S]*?)\]\.map\(/);
  if (!m) throw new Error("Spielplan (const M) nöd im index.html gfunde");
  return JSON.parse("[" + m[1] + "]").map(x => ({ g: x[0], h: x[1], a: x[2], dt: x[3] }));
}
function buildModelTips(prev) {
  let html, ratings;
  try {
    html = readFileSync(INDEX_FILE, "utf8");
    ratings = JSON.parse(readFileSync(ELO_FILE, "utf8")).ratings;
    readCalibration(html);
  } catch (e) { console.warn("Modell-Tipp iifriere übersprunge: " + e.message); return prev || {}; }
  let fixtures;
  try { fixtures = extractFixtures(html); }
  catch (e) { console.warn("Modell-Tipp iifriere übersprunge: " + e.message); return prev || {}; }
  const now = Date.now(); const tips = {}; let frozen = 0, refreshed = 0, fallback = 0;
  for (const f of fixtures) {
    const key = pairKey(f.h, f.a, false);
    const lockMs = new Date(f.dt + ":00+02:00").getTime() - LOCK_MS;
    if (now >= lockMs && prev && prev[key]) { tips[key] = prev[key]; frozen++; continue; } // zue -> iigfrore lah
    const rh = ratings[f.h], ra = ratings[f.a];
    if (!Number.isInteger(rh) || !Number.isInteger(ra)) { if (prev && prev[key]) tips[key] = prev[key]; continue; }
    tips[key] = tipFromRatings(rh, ra);
    if (now >= lockMs) fallback++; else refreshed++;  // fallback = scho zue, aber no kei iigfroreni Wert (Erstlauf)
  }
  console.log(`Modell-Tipp: ${refreshed} aktualisiert (offe), ${frozen} iigfrore (zue)` +
    (fallback ? `, ${fallback} nochträglich gsetzt (scho zue, kei früecheri Wert)` : ""));
  return tips;
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
const standings = await fetchStandings();  // null wenn nöd verfügbar — KO-Mappig fallt denn uf gruppe-only-Modus zrugg
const { results, unknown, skipped } = buildResults(matches);
const { pairs: koPairs, ambiguous } = buildKoPairs(matches, standings);

if (unknown.length) {
  // Es unmappts Team isch e ächte Mappig-Lücke -> abbräche, statt e halbe Stand schriibe,
  // damit de Maintainer en Alias chan nochetrage (ALIASES{} obe).
  console.error("Unbekannti Team-Name vo de API (Alias i update-results.mjs ergänze):\n  " +
    unknown.join("\n  "));
  process.exit(1);
}
if (skipped.length) skipped.forEach(s => console.warn(s));
if (ambiguous.length) {
  // Zwöideutigi R32-Slot (z.B. {C,F} -> M75 ODER M76): nöd fatal. index.html fallt
  // bi sone Match uf d klassisch Standings-basierti Logik zrugg. Trotzdem logge,
  // demit de Maintainer cha entscheide, ob er en Tiebreak-Heuristik mues nochiibaue.
  console.warn("R32-Spiel ohni eindütigi Zuweisig (fallt uf interni Bracket-Logik zrugg):");
  ambiguous.forEach(s => console.warn(`  ${s}`));
}

let prevModelTips = {};
try { prevModelTips = JSON.parse(readFileSync(OUT_FILE, "utf8")).model_tips || {}; } catch (e) { /* no kei results.json */ }
const modelTips = buildModelTips(prevModelTips);

logDiff(results);
const sortedResults = {};
for (const k of Object.keys(results).sort()) sortedResults[k] = results[k];
const sortedKoPairs = {};
for (const k of Object.keys(koPairs).sort((a, b) => +a - +b)) sortedKoPairs[k] = koPairs[k];
const sortedModelTips = {};
for (const k of Object.keys(modelTips).sort()) sortedModelTips[k] = modelTips[k];
const out = {
  updated: new Date().toISOString().slice(0, 10),
  source: "football-data.org",
  results: sortedResults,
  ko_pairs: sortedKoPairs,
  model_tips: sortedModelTips
};
writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + "\n");
console.log(`results.json aktualisiert (${Object.keys(sortedResults).length} gspilti Spiel, ${Object.keys(sortedKoPairs).length} R32-Paarige, ${Object.keys(sortedModelTips).length} Modell-Tipps).`);
