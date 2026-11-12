// Génère le site publié dans public/ à partir de src/.
//   node build.mjs          construit public/
//   node build.mjs --check  vérifie que public/ correspond exactement à src/ (utilisé par tests/run.sh)
// Ne jamais modifier public/ à la main.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src'), STATIC = join(SRC, 'static'), OUT = join(ROOT, 'public');
const CHECK = process.argv.includes('--check');

// sw.js ne doit jamais changer : un nouveau sw.js chez l'hébergeur déclenche l'alerte « code remplacé » chez
// l'utilisateur, et une mise à jour approuvée passe par une désinstallation complète. Voir README.
// Pour un changement impératif : modifier src/static/sw.js, lancer « node build.mjs --allow-sw-change »,
// puis reporter ici l'empreinte affichée.
const SW_SHA256 = 'b190f12a74af39ddf67efeb5b43587d0794b9a1dd79aafdcaa60a7bb235a3532';

const fail = msg => { console.error('ÉCHEC : ' + msg); process.exit(1); };
const sha256 = (buf, enc = 'hex') => createHash('sha256').update(buf).digest(enc);

// 1. Historique des versions
let log;
try { log = JSON.parse(readFileSync(join(SRC, 'changelog.json'), 'utf8')); } catch (e) { fail('src/changelog.json illisible : ' + e.message); }
if (!Array.isArray(log) || !log.length) fail('src/changelog.json doit être une liste non vide');
const seen = new Set();
for (const e of log) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(e.version || '')) fail(`version invalide : ${JSON.stringify(e.version)}`);
  if (seen.has(e.version)) fail(`version en double : ${e.version}`); seen.add(e.version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) fail(`date invalide pour ${e.version} (attendu AAAA-MM-JJ)`);
  if (typeof e.titre !== 'string' || !e.titre) fail(`titre manquant pour ${e.version}`);
  if (!Array.isArray(e.nouveautes) || !e.nouveautes.length || e.nouveautes.some(n => typeof n !== 'string' || !n)) fail(`nouveautés manquantes pour ${e.version}`);
}
const num = v => v.split('.').map(Number).concat(0, 0).slice(0, 3);
for (let i = 1; i < log.length; i++) {
  const a = num(log[i - 1].version), b = num(log[i].version);
  const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (newer <= 0) fail(`ordre du changelog : ${log[i - 1].version} doit être plus récente que ${log[i].version} (la plus récente en premier)`);
}

// 2. Page : historique injecté, puis empreinte CSP du script recalculée
let html = readFileSync(join(SRC, 'index.html'), 'utf8');
const MARK = '/*BUILD:CHANGELOG*/[]';
if (html.split(MARK).length !== 2) fail(`repère ${MARK} absent ou en double dans src/index.html`);
html = html.replace(MARK, JSON.stringify(log.map(({ version, date, titre, nouveautes }) => ({ version, date, titre, nouveautes }))));
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) fail(`un seul script en ligne attendu, ${scripts.length} trouvé(s)`);
const hash = sha256(Buffer.from(scripts[0][1], 'utf8'), 'base64');
const csp = /script-src 'sha256-[A-Za-z0-9+/=]+'/g;
if ((html.match(csp) || []).length !== 1) fail("directive « script-src 'sha256-…' » absente ou en double dans la CSP");
html = html.replace(csp, `script-src 'sha256-${hash}'`);

// 3. Fichiers statiques, copiés tels quels
const files = new Map([['index.html', Buffer.from(html, 'utf8')]]);
const walk = (dir, rel = '') => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (statSync(p).isDirectory()) walk(p, r);
    else { if (files.has(r)) fail(`${r} existe à la fois dans src/ et src/static/`); files.set(r, readFileSync(p)); }
  }
};
walk(STATIC);
const sw = files.get('sw.js');
if (!sw) fail('src/static/sw.js manquant');
if (sha256(sw) !== SW_SHA256) {
  if (!process.argv.includes('--allow-sw-change')) fail(`src/static/sw.js a changé (empreinte ${sha256(sw)}). Voir README avant de le modifier.`);
  console.warn(`ATTENTION : sw.js modifié. Nouvelle empreinte à reporter dans build.mjs : ${sha256(sw)}`);
}

// 4. Écriture, ou vérification
const listOut = (dir, rel = '', acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (statSync(p).isDirectory()) listOut(p, r, acc); else acc.push(r);
  }
  return acc;
};
if (CHECK) {
  const have = listOut(OUT), diff = [];
  for (const [r, buf] of files) if (!existsSync(join(OUT, r)) || !readFileSync(join(OUT, r)).equals(buf)) diff.push(r);
  for (const r of have) if (!files.has(r)) diff.push(r + ' (en trop)');
  if (diff.length) fail(`public/ n'est pas à jour (${diff.join(', ')}) : lance « node build.mjs »`);
  console.log(`public/ à jour · version ${log[0].version} · script sha256-${hash}`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [r, buf] of files) { mkdirSync(dirname(join(OUT, r)), { recursive: true }); writeFileSync(join(OUT, r), buf); }
  console.log(`public/ généré · version ${log[0].version} · ${files.size} fichiers · script sha256-${hash}`);
}
