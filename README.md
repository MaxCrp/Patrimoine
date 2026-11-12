# Patrimoine

Application web installable (PWA) de suivi de patrimoine et de budget du foyer. Description complète et historique des versions : `SPEC.md`.

## Organisation du dépôt

```
src/index.html        la page (HTML, CSS et script en ligne) : c'est ici qu'on modifie l'app
src/changelog.json    historique des versions, le plus récent en premier (affiché dans l'app)
src/static/           fichiers copiés tels quels : sw.js, manifeste, icônes, _headers
build.mjs             génère public/ à partir de src/
public/               site publié par Cloudflare Pages : généré, ne jamais le modifier à la main
tests/run.sh          tests à faire passer avant chaque livraison
```

Cloudflare Pages publie la branche `main`, dossier de sortie `public`, sans commande de build.

## Livrer une version

1. Modifier `src/`.
2. Ajouter la version en tête de `src/changelog.json` : numéro, date (AAAA-MM-JJ), titre, nouveautés rédigées pour l'utilisateur.
3. `node build.mjs` : génère `public/`. Le build insère l'historique dans la page et recalcule l'empreinte CSP du script.
4. `bash tests/run.sh` : doit passer.
5. Cocher les cases de la release dans `SPEC.md` § 10, puis commit et push sur `main`.

L'app publiée n'est jamais installée sans accord : au démarrage, elle compare l'empreinte du code en ligne à celle que l'utilisateur a approuvée et propose la mise à jour. Une fois installée, la fiche « Nouveautés » présente les versions plus récentes que la dernière vue.

## Empreinte CSP

La politique de sécurité n'autorise le script en ligne que par son empreinte SHA-256. Une empreinte fausse bloque tout le script : la page reste blanche. `build.mjs` la recalcule à chaque build, et `tests/run.sh` la vérifie.

## Service worker (`src/static/sw.js`)

Ne pas le modifier sans raison impérative. Il sert toujours le code installé ; un `sw.js` modifié chez l'hébergeur s'installe de lui-même et déclenche chez l'utilisateur l'alerte « programme remplacé », puis une réinstallation complète. Le build refuse un `sw.js` dont l'empreinte a changé. En cas de changement impératif : `node build.mjs --allow-sw-change`, puis reporter la nouvelle empreinte dans `build.mjs` (`SW_SHA256`).

Contraintes connues : Cloudflare redirige `/index.html` vers `/`, et Safari refuse une page servie par le service worker depuis une réponse redirigée. Le cache ne contient donc que `./`, servi pour toute navigation.
