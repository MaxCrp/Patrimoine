// Sert toujours le code déjà installé : aucune mise à jour silencieuse.
// La page vérifie l'empreinte du code et demande confirmation avant d'installer une nouvelle version.
// Aucune donnée personnelle ne passe ici : elles restent chiffrées dans IndexedDB.
const CACHE = 'patrimoine-v3';
const SHELL = ['./', './index.html', './sw.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.searchParams.has('fresh')) return; // contrôle d'empreinte : laissé passer au réseau
  if (url.searchParams.has('u')) return;     // rechargement après mise à jour approuvée
  const key = req.mode === 'navigate' ? new Request(new URL('./index.html', location.href).href) : req;
  e.respondWith(caches.match(key).then(r => r || fetch(req)));
});
