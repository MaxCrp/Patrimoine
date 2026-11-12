// Parcours de l'app publiée (public/) dans Chromium, en mode démo.
// Un serveur local reproduit Cloudflare : /index.html est redirigé vers /.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.log('IGNORÉ : Playwright n’est pas installé, parcours non testés.'); process.exit(0); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/index.html') { res.writeHead(301, { Location: '/' }); return res.end(); }
  const file = join(ROOT, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? '  ok ' : '  ÉCHEC'} ${label}${!cond && extra ? ' · ' + extra : ''}`); if (!cond) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Données de démo avec un foyer à deux, budget du mois équilibré au centime
const DEMO_FOYER = () => {
  const k = monthKey();
  S.household = { on: true, members: [{ id: 'moi', name: 'Moi', income: 2600 }, { id: 'm2', name: 'Léa', income: 2100 }], split: { mode: 'revenus', shares: {} } };
  S.settings.plaisir = 200; for (const a of S.accounts) a.owner = 'moi';
  const it = (n, a, by, pt = true) => ({ id: uid(), n, a, by, r: true, ...(pt ? { pt: true } : {}) });
  S.pot[k] = { items: [it('Loyer', 1150, 'moi'), it('Électricité', 84.37, 'm2'), it('Courses', 520.12, 'm2'), it('Internet', 29.99, 'moi')],
    perso: [{ id: uid(), n: 'Perso', a: 500, r: true, pt: true }], transfers: [], inc: { moi: 2600, m2: 2100 }, seeded: true, persoSeeded: true };
  const c = controlOf(k); S.pot[k].perso[0].a = Math.round((500 + c.ecart) * 100) / 100;
  potMonth = k; render();
};
const fresh = async () => {
  await page.goto(URL); await page.waitForSelector('[data-act="demo"]');
  await page.click('[data-act="demo"]'); await page.waitForSelector('.tabs');
  await page.evaluate(DEMO_FOYER);
};

console.log('Démarrage');
await page.goto(URL); await page.waitForSelector('[data-act="demo"]');
ok(errors.length === 0, 'page chargée sans erreur (empreinte CSP valide)', errors.join(' | '));
ok(await page.evaluate(() => typeof APP_VERSION === 'string' && APP_VERSION !== 'dev' && CHANGELOG.length > 0), 'version et historique injectés par le build');

console.log('Service worker et hors ligne');
await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(500);
await page.context().setOffline(true);
for (const u of ['', 'index.html', 'autre?x=1']) { await page.goto(URL + u); ok(await page.title() === 'Patrimoine', `hors ligne : /${u} s’ouvre`); }
await page.context().setOffline(false);

console.log('Navigation');
await fresh();
ok(await page.evaluate(() => [...document.querySelectorAll('.tab span')].map(s => s.textContent).join(',')) === 'Accueil,Foyer,Ce mois,Comptes,Résumé', 'onglets avec le foyer activé');
await page.evaluate(() => { S.pot[monthKey()].items[3].pt = false; render(); });
await page.click('.tab[data-view="foyer"]');
ok(await page.textContent('h1') === 'Foyer', 'onglet Foyer');
const before = await page.evaluate(() => document.querySelectorAll('.ptlist li.done').length);
await page.click('.ptlist li:not(.done) [data-act="point"]');
ok(await page.evaluate(() => document.querySelectorAll('.ptlist li.done').length) === before + 1, 'pointer une charge');
for (const v of ['communes', 'perso', 'virements', 'revenus']) {
  await page.click(`[data-act="foyersub"][data-v="${v}"]`); ok(await page.isVisible('[data-act="back"]'), `section ${v}`); await page.click('[data-act="back"]');
}
for (const [act, sel] of [['quickperso', '#f-perso'], ['quickrefund', '#f-refund'], ['quicktransfer', '#f-transfer'], ['quickcharge', '#f-charge']]) {
  await page.click('[data-act="quick"]'); await page.click(`[data-act="${act}"]`);
  ok(await page.isVisible(sel), `bouton + : ${act}`); await page.click('.sheet button[data-act="close"]');
}
for (const v of ['saisie', 'comptes', 'resume', 'home']) { await page.click(`.tab[data-view="${v}"]`); ok(await page.isVisible('main'), `onglet ${v}`); }

console.log('Contrôle du mois');
const ctrl = async setup => { await fresh(); return page.evaluate(src => { const k = monthKey(), prev = addMonths(k, -1); eval(src); const c = controlOf(k); return { e: Math.round(c.ecart * 100) / 100, f: Math.round(c.ecartFin * 100) / 100, a: Math.round(c.attente * 100) / 100 }; }, setup); };
let r = await ctrl('');
ok(r.e === 0 && r.f === 0, 'budget équilibré : écart nul', JSON.stringify(r));
ok(Math.abs(r.a) > 1, 'régularisation en attente comptée', JSON.stringify(r));
r = await ctrl(`S.pot[k].transfers.push({ id: uid(), from: 'm2', to: 'moi', a: 100, reg: true });`);
ok(r.e === 0, 'remboursement partiel du conjoint : écart inchangé', JSON.stringify(r));
r = await ctrl(`S.pot[k].perso.push({ id: uid(), n: 'À venir', a: 300, r: true });`);
ok(r.e === 0 && r.f === -300, 'charge non pointée : hors écart, comptée dans l’écart prévu', JSON.stringify(r));
r = await ctrl(`S.pot[k].items[0].pt = false;`);
ok(r.f === 0, 'charge commune non pointée : écart prévu nul', JSON.stringify(r));
r = await ctrl(`S.pot[prev] = { items: [], perso: [{ id: 'c1', n: 'Pharmacie', a: 30, r: false, pt: true }], transfers: [] }; S.pot[k].perso.push({ id: uid(), n: 'Remb.', a: -30, r: false, rb: true, of: { k: prev, id: 'c1', n: 'Pharmacie' } });`);
ok(r.e === 30, 'remboursement reçu : compté comme une entrée', JSON.stringify(r));

console.log('Versions');
await fresh();
await page.click('[data-act="settings"]'); await page.click('[data-act="setpage"][data-p="versions"]');
ok(await page.evaluate(() => document.querySelectorAll('.sheet .news').length === CHANGELOG.length), 'Réglages › Versions liste tout l’historique');
await page.click('.sheet button[data-act="close"], .sheet [data-act="settings"]').catch(() => {});
const news = await page.evaluate(async () => { closeSheet(); ui.seenVersion = CHANGELOG[2].version; await checkNews('f-unlock'); return { n: document.querySelectorAll('.sheet .news').length, seen: ui.seenVersion }; });
ok(news.n === 2 && news.seen === (await page.evaluate(() => APP_VERSION)), 'Nouveautés : versions plus récentes que la dernière vue', JSON.stringify(news));
const again = await page.evaluate(async () => { closeSheet(); await checkNews('f-unlock'); return !!document.querySelector('.sheet'); });
ok(!again, 'Nouveautés : une seule fois par version');

ok(errors.length === 0, 'aucune erreur pendant les parcours', errors.join(' | '));
await browser.close(); server.close();
if (failed) { console.error(`${failed} test(s) en échec`); process.exit(1); }
console.log('Parcours : tout est bon');
