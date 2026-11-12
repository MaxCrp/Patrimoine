#!/usr/bin/env bash
# Tests à faire passer avant chaque livraison : bash tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1. public/ à jour et conforme (changelog, empreinte CSP, sw.js inchangé)"
node build.mjs --check

echo "2. Syntaxe du script et empreinte CSP de la page publiée"
node -e '
const fs = require("fs"), c = require("crypto");
const s = fs.readFileSync("public/index.html", "utf8");
const b = s.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(b);
const h = c.createHash("sha256").update(b).digest("base64");
if (!s.includes(`script-src '"'"'sha256-${h}'"'"'`)) { console.error("ÉCHEC : empreinte CSP"); process.exit(1); }
console.log("  ok syntaxe et empreinte");'

echo "3. Parcours dans le navigateur"
node tests/smoke.mjs

echo "Tous les tests passent."
