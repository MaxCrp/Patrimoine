// Sert toujours le code déjà installé : aucune mise à jour silencieuse.
// La page vérifie l'empreinte du code et demande confirmation avant d'installer une nouvelle version.
// Aucune donnée personnelle ne passe ici : elles restent chiffrées dans IndexedDB.
const CACHE = 'patrimoine-v4';
// Pas de ./index.html : Cloudflare le redirige vers ./, et Safari refuse une page servie
// par le service worker si la réponse en cache porte une trace de redirection.
const SHELL = ['./', './sw.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
// Une réponse redirigée est recopiée telle quelle, sans sa trace de redirection.
const clean = r => r.redirected ? r.blob().then(b => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers })) : r;
const put = (c, u) => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' : ' + r.status); return clean(r); }).then(r => c.put(u, r));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => put(c, u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Le contrôle d'empreinte passe au réseau, mais jamais pour une navigation :
  // une simple URL avec ?fresh permettrait sinon de charger du code non approuvé.
  if (url.searchParams.has('fresh') && req.destination !== 'document' && req.mode !== 'navigate') return;
  // Toute navigation reçoit ./, quelle que soit l'URL demandée.
  const key = req.mode === 'navigate' ? new URL('./', location.href).href : req;
  e.respondWith(caches.match(key).then(r => r || fetch(req).then(clean)));
});
