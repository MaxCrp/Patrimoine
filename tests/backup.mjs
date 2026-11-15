// v1.17 : sauvegarde automatique sur Google Drive (Google, Drive et service d'autorisation simulés).
// Construit une version de test de l'app, branchée sur un service fictif, dans un dossier temporaire.
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.log('IGNORÉ : Playwright n’est pas installé, sauvegarde automatique non testée.'); process.exit(0); }

const WORKER = 'https://auth.test.example', CLIENT = 'test-123.apps.googleusercontent.com', PASS = 'mot de passe du coffre drive';
const TMP = mkdtempSync(join(tmpdir(), 'patrimoine-gd-')), OUT = join(TMP, 'on'), OFF = join(TMP, 'off');
writeFileSync(join(TMP, 'on.json'), JSON.stringify({ clientId: CLIENT, workerUrl: WORKER }));
writeFileSync(join(TMP, 'off.json'), '{}');
const build = (out, cfg) => execFileSync('node', ['build.mjs'], { cwd: ROOT, env: { ...process.env, PT_OUT: out, PT_BACKUP_CONFIG: cfg }, stdio: 'pipe' });
build(OUT, join(TMP, 'on.json')); build(OFF, join(TMP, 'off.json'));

let failed = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? '  ok ' : '  ÉCHEC'} ${label}${!cond && extra ? ' · ' + extra : ''}`); if (!cond) failed++; };
const csp = f => (readFileSync(join(f, 'index.html'), 'utf8').match(/connect-src ([^;]*);/) || [])[1] || '';
console.log('Configuration');
ok(csp(OUT).includes('https://www.googleapis.com') && csp(OUT).includes(WORKER) && !csp(OFF).includes('googleapis'), 'CSP : Google Drive et le service ouverts seulement quand la sauvegarde est configurée', csp(OUT));
ok(existsSync(join(OUT, 'confidentialite.html')) && existsSync(join(OUT, 'conditions.html')), 'pages publiques de confidentialité et de conditions');

// Serveur de l'app (comme Cloudflare : /index.html redirigé vers /, /confidentialite servi depuis confidentialite.html)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/index.html') { res.writeHead(301, { Location: '/' }); return res.end(); }
  let file = join(OUT, path === '/' ? 'index.html' : path.slice(1));
  if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(OUT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}/`;

/* Faux Google : page d'autorisation, service d'autorisation, Drive */
const G = { files: [], seq: 0, auth: [], token: [], refresh: [], uploads: 0, patches: 0, deletes: 0, revoked: 0, fail401: 0, refreshErr: null, offline: false, resumable: 0 };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'location' };
const jr = (route, status, o, h = {}) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...h }, body: JSON.stringify(o) });
const meta = f => ({ id: f.id, name: f.name, createdTime: f.createdTime, modifiedTime: f.modifiedTime, size: String(f.content.length) });
const parseMultipart = (buf, ctype) => {
  const b = ctype.match(/boundary=(.+)$/)[1], parts = buf.toString('utf8').split('--' + b).slice(1, -1).map(p => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
  return { meta: JSON.parse(parts[0] || '{}'), content: parts[1] || '' };
};
async function fakeGoogle(ctx) {
  await ctx.route('https://accounts.google.com/**', route => {
    const u = new URL(route.request().url()); G.auth.push(Object.fromEntries(u.searchParams));
    const back = new URL(u.searchParams.get('redirect_uri')); back.searchParams.set('code', 'CODE-' + G.auth.length); back.searchParams.set('state', u.searchParams.get('state'));
    return route.fulfill({ status: 302, headers: { location: back.href } });
  });
  await ctx.route(WORKER + '/**', async route => {
    const r = route.request(); if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const p = new URL(r.url()).pathname, b = JSON.parse(r.postData());
    if (p === '/token') { G.token.push(b); return jr(route, 200, { access_token: 'AT-1', expires_in: 3599, refresh_token: 'RT-SECRET-42' }); }
    G.refresh.push(b); if (G.refreshErr) return jr(route, 400, { error: G.refreshErr });
    return jr(route, 200, { access_token: 'AT-' + (G.refresh.length + 1), expires_in: 3599 });
  });
  await ctx.route('https://oauth2.googleapis.com/revoke', route => { G.revoked++; return route.fulfill({ status: 200, headers: cors, body: '' }); });
  await ctx.route('https://www.googleapis.com/**', async route => {
    const r = route.request(), u = new URL(r.url()), m = r.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (G.offline) return route.abort('internetdisconnected');
    if (!/^Bearer AT-/.test(r.headers().authorization || '')) return jr(route, 401, { error: { code: 401 } });
    if (G.fail401) { G.fail401--; return jr(route, 401, { error: { code: 401 } }); }
    const now = new Date().toISOString();
    if (u.pathname === '/drive/v3/files' && m === 'GET') { G.lastList = Object.fromEntries(u.searchParams); return jr(route, 200, { files: [...G.files].sort((a, b) => b.createdTime.localeCompare(a.createdTime)).map(meta) }); }
    if (u.pathname === '/upload/drive/v3/files' && m === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
      const { meta: mt, content } = parseMultipart(r.postDataBuffer(), r.headers()['content-type']);
      const f = { id: 'file' + String(++G.seq).padStart(6, '0') + 'xyz', name: mt.name, parents: mt.parents, createdTime: now, modifiedTime: now, content }; G.files.push(f); G.uploads++;
      return jr(route, 200, meta(f));
    }
    if (u.pathname === '/upload/drive/v3/files' && m === 'POST' && u.searchParams.get('uploadType') === 'resumable') {
      G.pending = JSON.parse(r.postData()); return route.fulfill({ status: 200, headers: { ...cors, location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=XYZ' }, body: '' });
    }
    if (u.pathname === '/upload/drive/v3/files' && m === 'PUT') {
      const f = { id: 'file' + String(++G.seq).padStart(6, '0') + 'xyz', name: G.pending.name, parents: G.pending.parents, createdTime: now, modifiedTime: now, content: r.postData() }; G.files.push(f); G.uploads++; G.resumable++;
      return jr(route, 200, meta(f));
    }
    const mm = u.pathname.match(/^\/(upload\/)?drive\/v3\/files\/([\w-]+)$/), f = mm && G.files.find(x => x.id === mm[2]);
    if (mm && !f) return jr(route, 404, { error: { code: 404 } });
    if (mm && m === 'PATCH') { f.content = parseMultipart(r.postDataBuffer(), r.headers()['content-type']).content; f.modifiedTime = now; G.patches++; return jr(route, 200, meta(f)); }
    if (mm && m === 'DELETE') { G.files = G.files.filter(x => x !== f); G.deletes++; return route.fulfill({ status: 204, headers: cors, body: '' }); }
    if (mm && m === 'GET' && u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: f.content });
    return jr(route, 400, { error: { code: 400 } });
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const newPage = async errs => {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } }); await fakeGoogle(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept()); return p;
};
const sheetText = p => p.evaluate(() => document.querySelector('.sheet')?.innerText || '');

/* ---------- Premier appareil : création du coffre, connexion ---------- */
console.log('Connexion');
const e1 = [], p = await newPage(e1);
await p.goto(APP); await p.waitForSelector('#f-setup');
ok(!!(await p.$('[data-act=gdRestoreStart]')), 'écran de création : « Restaurer depuis Google Drive »');
await p.fill('#p1', PASS); await p.fill('#p2', PASS); await p.click('#f-setup [type=submit]');
await p.waitForSelector('.tabs', { timeout: 15000 });
await p.evaluate(async () => { closeSheet(); const a = { id: uid(), owner: 'moi', name: 'Livret Nuage', type: 'livretA', ...DEFAULTS.livretA }; S.accounts.push(a); (S.entries[monthKey()] ||= {})[a.id] = { value: 12345, deposit: 100 }; await save(); });
await p.evaluate(() => sheetSetPage('backup'));
ok(/Sauvegarde automatique\s*Google Drive\s*désactivée/.test(await sheetText(p)), 'Réglages › Données : « Sauvegarde automatique · désactivée »');
await p.click('[data-act=gdSheet]');
await Promise.all([p.waitForURL(u => u.href.startsWith(APP) && u.search === '' && !u.href.includes('accounts.google'), { timeout: 10000 }), p.click('.sheet [data-act=gdConnect]')]);
await p.waitForSelector('#f-unlock');
const a = G.auth[0] || {};
ok(a.scope === 'https://www.googleapis.com/auth/drive.appdata' && a.access_type === 'offline' && a.code_challenge_method === 'S256' && a.redirect_uri === APP && a.client_id === CLIENT, 'page Google : droit drive.appdata seul, accès durable, PKCE, adresse de retour de l’app', JSON.stringify(a));
ok(await p.evaluate(() => location.href) === APP && /terminer la connexion à Google Drive/.test(await p.evaluate(() => document.body.innerText)), 'retour : adresse nettoyée, « déverrouille l’app pour terminer la connexion »');
await p.fill('#p1', PASS); await p.click('#f-unlock [type=submit]');
await p.waitForSelector('.tabs', { timeout: 15000 });
for (let i = 0; i < 40 && !G.files.length; i++) await wait(150);
const t0 = G.token[0] || {};
ok(t0.code === 'CODE-1' && createHash('sha256').update(t0.code_verifier || '').digest('base64url') === a.code_challenge, 'échange du code par le service, avec le vérificateur PKCE');
ok(G.files.length === 1 && G.files[0].parents?.[0] === 'appDataFolder' && /^patrimoine-sauvegarde-/.test(G.files[0].name), 'première sauvegarde dans le dossier caché de l’app', JSON.stringify(G.files.map(f => f.name)));
ok(G.lastList?.spaces === 'appDataFolder' && /patrimoine-/.test(G.lastList?.q || ''), 'liste limitée aux fichiers de Patrimoine dans le dossier caché');
const first = JSON.parse(G.files[0]?.content || '{}');
ok(first.app === 'patrimoine' && first.ct && first.slots?.pw && !first.slots?.pk && !G.files[0].content.includes('Livret Nuage'), 'fichier = sauvegarde chiffrée habituelle (mot de passe seul, sans Face ID)');
const tok = await p.evaluate(async () => { const e = await store.get('gdrive'); return { enc: !!(e?.iv && e?.ct), plain: JSON.stringify(e).includes('RT-SECRET') }; });
ok(tok.enc && !tok.plain, 'autorisation durable chiffrée sur l’appareil');
ok(!G.files[0].content.includes('RT-SECRET'), 'autorisation absente du fichier de sauvegarde');
await p.evaluate(() => sheetSetPage('backup'));
ok(/Google Drive · dernière :/.test(await sheetText(p)), 'Réglages : « Google Drive · dernière : … »');
await p.evaluate(() => closeSheet());

/* ---------- Rythme ---------- */
console.log('Rythme');
await p.evaluate(() => { BK_DELAY = 300; S.accounts[0].name = 'Livret Nuage modifié'; return save(); }); await wait(1500);
ok(G.patches === 1 && G.files.length === 1 && JSON.parse(G.files[0].content).savedAt > first.savedAt, 'modification : envoi peu après, la version de moins d’une heure est mise à jour', `patch ${G.patches}, fichiers ${G.files.length}`);
const up0 = G.uploads + G.patches;
ok(await p.evaluate(() => runBackup()) === 'same' && G.uploads + G.patches === up0, 'données inchangées : rien n’est envoyé');
const old = Date.now() - 3 * 3600e3;
G.files[0].createdTime = new Date(old).toISOString();
for (let i = 1; i <= 30; i++) { const t = new Date(old - i * 3600e3).toISOString(); G.files.push({ id: 'old' + String(i).padStart(7, '0') + 'ab', name: 'patrimoine-sauvegarde-ancienne.json', createdTime: t, modifiedTime: t, content: '{}' }); }
await p.evaluate(() => { S.accounts[0].name = 'encore'; return save(); }); await wait(1500);
ok(G.files.length === 30 && G.deletes === 2 && !G.files.some(f => f.id === 'old0000030ab' || f.id === 'old0000029ab'), 'nouvelle version après une heure, 30 versions gardées (les plus anciennes supprimées)', `fichiers ${G.files.length}, suppressions ${G.deletes}`);
const r0 = G.refresh.length; G.fail401 = 1;
await p.evaluate(() => { S.accounts[0].name = 'jeton'; return runBackup(); });
ok(G.refresh.length === r0 + 1 && G.refresh.at(-1).refresh_token === 'RT-SECRET-42' && await p.evaluate(() => !bkState().err), 'jeton d’accès refusé : renouvelé, puis envoi réussi');
await p.evaluate(() => { GD_SIMPLE_MAX = 10; S.accounts[0].name = 'grosse'; return runBackup(); });
ok(G.resumable === 1 && await p.evaluate(() => !bkState().err), 'grosse sauvegarde : envoi en deux temps');
await p.evaluate(() => { GD_SIMPLE_MAX = 4.5e6; });
const pa = G.patches + G.uploads;
await p.evaluate(async () => { BK_DELAY = 600e3; S.accounts[0].name = 'arrière-plan'; await save(); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(1500);
ok(G.patches + G.uploads === pa + 1, 'l’app passe en arrière-plan : la modification part tout de suite');
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); BK_DELAY = 300; });

/* ---------- Ce mois, points d'attention ---------- */
console.log('Ce mois et points d’attention');
const cm = await p.evaluate(() => { S.settings.lastExport = null; go('saisie'); return [...document.querySelectorAll('.steps li')].map(l => l.className + ':' + l.innerText.replace(/\s+/g, ' ')).find(x => /Sauvegarde/.test(x)) || ''; });
ok(/^ok/.test(cm) && /automatique, dernière le/.test(cm), 'Ce mois : la sauvegarde automatique compte comme une sauvegarde', cm);
ok(await p.evaluate(() => !alerts(focusMonth(), false, () => true, true).some(x => x.k === 'sauvegarde' || x.k === 'autobk')), 'pas de point d’attention « sauvegarde » quand la sauvegarde automatique fonctionne');

/* ---------- Échecs ---------- */
console.log('Échecs');
G.offline = true;
await p.evaluate(() => { S.accounts[0].name = 'hors ligne'; return runBackup(); });
const off = await p.evaluate(() => ({ err: bkState().err, sum: bkSummary() }));
ok(/injoignable|réseau/.test(off.err || '') && /échec/.test(off.sum), 'sans réseau : échec noté avec sa raison', off.err);
await p.evaluate(() => sheetAutoBk());
ok(/Dernier essai échoué/.test(await sheetText(p)) && /Dernière sauvegarde réussie/.test(await sheetText(p)), 'Sauvegarde automatique : dernier essai échoué et dernière réussie');
G.offline = false;
await p.click('.sheet [data-act=gdNow]'); await wait(1200);
ok(await p.evaluate(() => !bkState().err && Date.now() - bkState().last < 5000), 'réseau revenu : « Sauvegarder maintenant » réussit, l’échec disparaît');

/* ---------- Restaurer une version (dans l'app) ---------- */
console.log('Versions');
await p.evaluate(() => sheetAutoBk()); await p.click('.sheet [data-act=gdVersions]'); await wait(800);
const vs = await p.evaluate(() => document.querySelectorAll('.sheet [data-act=gdPick]').length);
ok(vs === G.files.length && vs === 30, 'liste des versions avec leur date', String(vs));
await p.click('.sheet [data-act=gdPick] >> nth=0'); await wait(800);
ok(!!(await p.$('.sheet #f-import')), 'version choisie : demande du mot de passe du coffre');
await p.evaluate(() => closeSheet());

/* ---------- Nouveau mot de passe : l'autorisation suit la nouvelle clé ---------- */
console.log('Changement de mot de passe');
const NEWPASS = 'nouveau mot de passe drive';
await p.evaluate(() => sheetChangePw());
await p.fill('#c0', PASS); await p.fill('#c1', NEWPASS); await p.fill('#c2', NEWPASS); await p.click('#f-chpw [type=submit]');
await wait(3500);
const cp = await p.evaluate(async () => { await gdLoadToken(); return { tok: gd.refresh, fp: await store.get('gdFp') }; });
ok(cp.tok === 'RT-SECRET-42', 'autorisation rechiffrée avec la nouvelle clé du coffre', JSON.stringify(cp));
await p.evaluate(() => runBackup()); await wait(300);
const latest = JSON.parse([...G.files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0].content);
ok(await p.evaluate(async v => { try { await openVault(v, { pass: 'nouveau mot de passe drive' }); return true; } catch { return false; } }, latest), 'nouvelle sauvegarde envoyée, ouverte avec le nouveau mot de passe');

/* ---------- Autorisation retirée ---------- */
console.log('Reconnexion');
G.refreshErr = 'invalid_grant';
await p.evaluate(() => { gd.access = null; gd.exp = 0; S.accounts[0].name = 'retirée'; return runBackup(); });
const rc = await p.evaluate(async () => ({ sum: bkSummary(), stored: !!(await store.get('gdrive')), alert: alerts(focusMonth(), false, () => true, true).some(x => x.k === 'autobk') }));
ok(/reconnexion nécessaire/.test(rc.sum) && !rc.stored && rc.alert, 'autorisation retirée : « reconnexion nécessaire », point d’attention, autorisation effacée', JSON.stringify(rc));
G.refreshErr = null;
ok(!e1.length, 'aucune erreur (premier appareil)', e1.join(' | '));

/* ---------- Nouvel appareil : restaurer depuis Google Drive ---------- */
console.log('Nouvel appareil');
G.files = G.files.filter(f => f.content !== '{}');
const e2 = [], q = await newPage(e2);
await q.goto(APP); await q.waitForSelector('#f-setup');
await Promise.all([q.waitForURL(u => u.href.startsWith(APP) && !u.href.includes('accounts.google'), { timeout: 10000 }), q.click('[data-act=gdRestoreStart]')]);
await q.waitForSelector('.sheet [data-act=gdPick]', { timeout: 10000 });
const n2 = await q.evaluate(() => document.querySelectorAll('.sheet [data-act=gdPick]').length);
ok(n2 === G.files.length && n2 > 0, 'retour de Google : versions listées', String(n2));
const before = G.uploads + G.patches;
await q.click('.sheet [data-act=gdPick] >> nth=0'); await q.waitForSelector('#f-import');
await q.fill('#pi', NEWPASS); await q.click('#f-import [type=submit]');
await q.waitForSelector('.tabs', { timeout: 15000 }); await wait(1500);
const rs = await q.evaluate(async () => ({ mode, acc: S?.accounts.length === 1 && S.accounts[0].type === 'livretA' && S.entries[monthKey()]?.[S.accounts[0].id]?.value === 12345, tok: !!(await store.get('gdrive')), on: gdOn() }));
ok(rs.mode === 'app' && rs.acc, 'coffre restauré avec son mot de passe', JSON.stringify(rs));
ok(rs.tok && rs.on, 'sauvegarde automatique reprise sur le nouvel appareil (autorisation gardée)');
ok(await q.evaluate(() => runBackup()) === 'same' && G.uploads + G.patches === before, 'contenu restauré depuis le Drive : pas renvoyé inutilement');

/* ---------- Déconnexion, données fictives ---------- */
console.log('Déconnexion');
await q.evaluate(() => sheetAutoBk()); await q.click('.sheet [data-act=gdDisconnect]'); await wait(600);
const dc = await q.evaluate(async () => ({ on: gdOn(), tok: !!(await store.get('gdrive')), sum: bkSummary() }));
ok(!dc.on && !dc.tok && G.revoked === 1 && /désactivée/.test(dc.sum), 'déconnexion : autorisation retirée chez Google et sur l’appareil', JSON.stringify(dc));
ok(!e2.length, 'aucune erreur (nouvel appareil)', e2.join(' | '));
const e3 = [], d = await newPage(e3);
await d.goto(APP); await d.waitForSelector('[data-act=demo]'); await d.click('[data-act=demo]'); await d.waitForSelector('.tabs');
ok(/indisponible avec les données fictives/.test(await d.evaluate(() => bkSummary())), 'données fictives : sauvegarde automatique indisponible');

await browser.close(); server.close(); rmSync(TMP, { recursive: true, force: true });
if (failed) { console.error(`${failed} test(s) en échec`); process.exit(1); }
console.log('Sauvegarde automatique : tout est bon');
