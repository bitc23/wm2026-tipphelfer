#!/usr/bin/env node
/* Holt d Live-Elo-Wertige vo eloratings.net und schriibt elo.json.
   Lauft täglich im GitHub-Action (.github/workflows/update-elo.yml);
   manuell: node update-elo.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const WORLD_URL = "https://www.eloratings.net/World.tsv";
const NAMES_URL = "https://www.eloratings.net/en.teams.tsv";
const OUT_FILE = new URL("./elo.json", import.meta.url);
const RATING_MIN = 1200, RATING_MAX = 2400;

// App-Team-Key -> [eloratings.net-Code, erwarteti englischi Bezeichnig]
// D Bezeichnig wird gegeprüeft, damit en stille Code-Wechsel (z.B. SC = Seychelles, nöd Scotland!) auffliegt.
const TEAMS = {
  Mexico: ["MX", "Mexico"],        SouthAfrica: ["ZA", "South Africa"],
  SouthKorea: ["KR", "South Korea"], Czechia: ["CZ", "Czechia"],
  Canada: ["CA", "Canada"],        Switzerland: ["CH", "Switzerland"],
  Qatar: ["QA", "Qatar"],          Bosnia: ["BA", "Bosnia and Herzegovina"],
  Brazil: ["BR", "Brazil"],        Morocco: ["MA", "Morocco"],
  Haiti: ["HT", "Haiti"],          Scotland: ["SQ", "Scotland"],
  USA: ["US", "United States"],    Australia: ["AU", "Australia"],
  Paraguay: ["PY", "Paraguay"],    Turkiye: ["TR", "Turkey"],
  Germany: ["DE", "Germany"],      Curacao: ["CW", "Curaçao"],
  IvoryCoast: ["CI", "Ivory Coast"], Ecuador: ["EC", "Ecuador"],
  Netherlands: ["NL", "Netherlands"], Japan: ["JP", "Japan"],
  Sweden: ["SE", "Sweden"],        Tunisia: ["TN", "Tunisia"],
  Belgium: ["BE", "Belgium"],      Egypt: ["EG", "Egypt"],
  Iran: ["IR", "Iran"],            NewZealand: ["NZ", "New Zealand"],
  Spain: ["ES", "Spain"],          CapeVerde: ["CV", "Cape Verde"],
  SaudiArabia: ["SA", "Saudi Arabia"], Uruguay: ["UY", "Uruguay"],
  France: ["FR", "France"],        Senegal: ["SN", "Senegal"],
  Iraq: ["IQ", "Iraq"],            Norway: ["NO", "Norway"],
  Argentina: ["AR", "Argentina"],  Algeria: ["DZ", "Algeria"],
  Austria: ["AT", "Austria"],      Jordan: ["JO", "Jordan"],
  Portugal: ["PT", "Portugal"],    DRCongo: ["CD", "DR Congo"],
  Uzbekistan: ["UZ", "Uzbekistan"], Colombia: ["CO", "Colombia"],
  England: ["EN", "England"],      Croatia: ["HR", "Croatia"],
  Ghana: ["GH", "Ghana"],          Panama: ["PA", "Panama"]
};

async function fetchTSV(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => line.split("\t"));
}

function buildRatings(worldRows, nameRows) {
  const nameByCode = new Map(nameRows.map(r => [r[0], r[1]]));
  const ratingByCode = new Map(worldRows.map(r => [r[2], Number(r[3])]));
  const errors = [], ratings = {};
  for (const [team, [code, expectedName]] of Object.entries(TEAMS)) {
    const name = nameByCode.get(code);
    if (name !== expectedName) {
      errors.push(`${team}: Code ${code} isch "${name}", erwartet "${expectedName}"`);
      continue;
    }
    const rating = ratingByCode.get(code);
    if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
      errors.push(`${team}: unplausibli Wertig ${rating}`);
      continue;
    }
    ratings[team] = rating;
  }
  return { ratings, errors };
}

function logDiff(ratings) {
  let old = null;
  try { old = JSON.parse(readFileSync(OUT_FILE, "utf8")).ratings; } catch (e) { /* no keis elo.json da */ }
  if (!old) { console.log("elo.json wird neu erstellt"); return; }
  const changed = Object.keys(ratings).filter(k => old[k] !== ratings[k]);
  if (!changed.length) { console.log("Kei Änderige sit em letschte Lauf"); return; }
  changed.forEach(k => console.log(`${k}: ${old[k]} -> ${ratings[k]}`));
}

const [worldRows, nameRows] = await Promise.all([fetchTSV(WORLD_URL), fetchTSV(NAMES_URL)]);
const { ratings, errors } = buildRatings(worldRows, nameRows);
if (errors.length) {
  console.error("Elo-Update abbroche:\n" + errors.join("\n"));
  process.exit(1);
}
logDiff(ratings);
const out = { updated: new Date().toISOString().slice(0, 10), source: "eloratings.net", ratings };
writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + "\n");
console.log(`elo.json aktualisiert (${Object.keys(ratings).length} Teams)`);
