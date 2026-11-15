# Patrimoine — spécification

Application web installable (PWA) de suivi de patrimoine et de budget du foyer, pensée pour l'iPhone.
Ce document décrit l'app telle qu'elle est, et range chaque évolution dans une release (§ 10).

## 1. Objet

- Suivre chaque mois la valeur des placements (livrets, PEA, assurance-vie, PER, épargne salariale) et l'épargne versée.
- Gérer le budget d'un foyer à plusieurs : charges communes réparties, charges perso, virements entre membres, reste à vivre.
- Vérifier chaque mois que les entrées et les sorties connues du compte courant s'équilibrent (contrôle du mois).
- Suivre des objectifs : apport immobilier, rente à la retraite, épargne mensuelle.

## 2. Plateforme et sécurité

- Une page HTML unique (HTML, CSS et JavaScript en ligne) écrite dans `src/`, générée dans `public/` par `node build.mjs`, servie par un Worker Cloudflare (« patrimoine », fichiers statiques) depuis la branche `main` : `wrangler.jsonc` publie le dossier `public`.
- Numéro de version et historique dans `src/changelog.json`, affichés dans Réglages › Versions ; fiche « Nouveautés » à la première ouverture après une mise à jour.
- Données chiffrées sur l'appareil (AES-GCM, clé dérivée du mot de passe par PBKDF2), stockées dans IndexedDB. Déverrouillage par mot de passe, ou par Face ID via une passkey (extension PRF).
- Aucune donnée n'est envoyée à un serveur, sauf l'analyse par IA quand l'utilisateur a enregistré sa propre clé (Anthropic ou Mistral).
- Content-Security-Policy stricte : le script en ligne n'est autorisé que par son empreinte SHA-256, recalculée à chaque build (une empreinte fausse laisse la page blanche).
- Le service worker sert toujours le code installé. Au démarrage, l'app calcule l'empreinte du code (`./` et `./sw.js`) et la compare à celle qu'a approuvée l'utilisateur. Une nouvelle version en ligne est proposée, jamais installée sans confirmation. Un `sw.js` modifié chez l'hébergeur déclenche une alerte : il ne doit changer que pour une raison impérative.
- En-têtes de sécurité dans `_headers` (interdiction d'affichage en cadre, pas de référent, permissions désactivées).

## 3. Données

- Comptes : type, titulaire (membre du foyer), objectifs auxquels ils comptent, dates d'ouverture et de clôture.
- Saisies mensuelles par compte : solde, versements ou mouvements détaillés (versements, reprises, versements de l'employeur, reprises pour un projet), relevés de compte courant importés et classés.
- Foyer par mois : revenus, prime, autres rentrées, virement plaisir, charges communes (payeur, répartition, pointage, projet), charges perso et remboursements, virements entre membres, report du mois précédent.
- Réglages : thème, mode clair ou sombre, budget de référence, membres et mode de répartition, clé d'IA, masquage des montants.
- Sauvegarde : export et restauration d'un fichier chiffré. Journal d'utilisation facultatif, exportable sans aucun montant.

## 4. Navigation

- Barre du bas avec le foyer activé : Accueil · Foyer · Ce mois · Comptes · Résumé, plus le bouton +. Sans foyer : Accueil · Comptes · Ce mois · Objectifs · Résumé.
- En-tête : masquer les montants, verrouiller, réglages.
- L'onglet Foyer affiche le nombre de charges à pointer.
- Bouton + : cartes Charge perso, Remboursement, Virement entre vous, Dépense commune, puis « Solde ou mouvement de compte ».

## 5. Accueil

- Patrimoine total du mois, variation et part versée, par membre ou pour le foyer.
- Graphique d'évolution (valeur et argent versé), ligne Objectifs (foyer activé).
- Répartition par catégorie. Bouton « Afficher l'évolution des placements » : une courbe par catégorie, mêmes couleurs que la répartition (choix mémorisé).
- Points d'attention (masquables par balayage) et statistiques : épargne mensuelle, taux d'épargne, performance des marchés, progression de l'apport, charges.

## 6. Foyer

- Sélecteur de mois. Qui doit quoi : une barre par personne (payé, remboursé, reste à rembourser, trait sur la part due), phrases tutoyées (« Tu dois… », « Léa te doit… »), bouton d'enregistrement du virement.
- Liste « À pointer » : charges communes et perso, coche ronde. Appui long pour modifier.
- Sections repliées : dépenses communes, charges perso, virements entre vous, revenus (prime, autres rentrées, virement plaisir), reste à vivre (barre empilée par personne).
- Répartition des charges : parts égales, au prorata des revenus du mois (hors primes et autres rentrées), ou parts choisies ; répartition propre possible pour une dépense.

## 7. Ce mois

- Anneau de progression et étapes : soldes des comptes, opérations du mois (relevés), revenus et charges du foyer, pointage des charges, sauvegarde. Étape en cours encadrée, étapes faites cochées.

## 8. Comptes, Objectifs, Résumé

- Comptes : placements triés par valeur, comptes de fonctionnement à part, comptes clôturés, fiche détaillée par compte.
- Objectifs : apport immobilier (avec palier intermédiaire), rente future, épargne mensuelle, capacité d'emprunt et simulateur d'achat immobilier, primes annuelles prévues, plafond de déduction PER.
- Résumé : bilan du mois, résumé texte à copier ou à envoyer à l'analyse IA.
- Contrôle du mois (dans le Résumé) :
  - Entrées moins sorties connues du compte courant, avec la régularisation en attente envers l'autre membre. Seules les charges pointées comptent ; les remboursements comptent comme des entrées.
  - Sous l'écart : les charges non pointées à venir et l'écart prévu une fois tout pointé. « Écart à expliquer » n'apparaît qu'au-delà de 1 €. Montants arrondis à l'euro, calculs au centime.
  - « D'où vient l'écart » : reste à vivre − virement plaisir − projets non financés par l'épargne.
  - Détail ligne par ligne et points à vérifier : salaire non saisi, doublons, livret en baisse sans reprise, compte sans titulaire, comparaison avec le relevé importé.

## 9. Réglages et apparence

- Pages : Apparence, Foyer, Budget de référence, Analyse par IA, Sécurité, Données de l'application, Versions, Code de l'app.
- Thèmes, chacun en clair et en sombre : Forêt, Banque privée, Salle des marchés, Registre, Atelier, Encre, Graphite, Olivier. Contraste du texte d'au moins 4,5:1.

## 10. Releases

Versions reconstituées à partir de l'historique du dépôt (commits entre parenthèses).

### v1.0 — 12/09/2026 — Version initiale
- [x] Coffre chiffré, suivi des comptes et des soldes mensuels (985941f, cacf83e)
- [x] Vérification de mise à jour au démarrage (764d14f)
- [x] Import de relevés (e2e9ff1)

### v1.1 — 13/09/2026 — Analyse par IA
- [x] Résumé du mois envoyé à l'IA avec la clé de l'utilisateur (0d0e687)

#### v1.1.1 — 13/09/2026
- [x] Correction de la mise à jour (3e1b0c4)

### v1.2 — 13/09/2026 — Gestion courante et foyer
- [x] Comptes courants, charges communes, virements entre membres du foyer (2c1671c, 5fa897f, 32829b2)

#### v1.2.1 — 13/09/2026
- [x] Corrections multiples et correction d'une faille de sécurité (c1f20b2, 353a471)

### v1.3 — 14/09/2026 — Refonte de l'interface
- [x] Nouvelle interface, calcul du solde depuis les mouvements, points d'attention à balayer (2ba7f17, f826145, 7d7a690)

#### v1.3.1 — 14/09/2026
- [x] Correction de la clé d'API (7142593)

### v1.4 — 16/09/2026 — Simulateur d'achat immobilier
- [x] Simulateur et capacité d'emprunt (18ac2a7)

### v1.5 — 18/09/2026 — Bouton +
- [x] Raccourci de saisie (31b680e)

#### v1.5.1 — 23/09/2026
- [x] Correction des fonctions du bouton + (ddd661e)

### v1.6 — 29/09/2026 — Statistiques
- [x] Page statistiques, objectif intermédiaire (a3a0071, 194b2d7)

### v1.7 — 04/10/2026 — Accueil et thèmes
- [x] Page d'accueil, statistiques, choix du thème, taux d'épargne (30daaae, ab1bfb7)

#### v1.7.1 — 04/10/2026
- [x] Correction d'un graphique (fd4f824)

### v1.8 — 05/10/2026 — Charges perso
- [x] Charges personnelles et remboursements (0d50a94, 5fa182f)

#### v1.8.1 — 05/10/2026
- [x] Correctifs des remboursements et du bouton + (a4df38d, f16d3f0)

### v1.9 — 12/10/2026 — Pointage et régularisation
- [x] Pointage des dépenses récurrentes, régularisation des charges (4563309, a35adf5)

### v1.10 — 25/10/2026 — Suivi d'utilisation et répartition
- [x] Journal d'utilisation exportable, modes de répartition (8ec3ba6, 662cb78)

#### v1.10.1 — 25/10/2026
- [x] Correction mineure (d2d4203)

### v1.11 — 26/10/2026 — Primes et retraite
- [x] Primes annuelles, objectifs, déduction PER (2170eec, 6e2a5ca, 2bb3c56)

#### v1.11.1 — 27/10/2026
- [x] Correction du calcul PER et corrections multiples (81b17d4, c65da8b)

### v1.12 — 30/10/2026 — Contrôle du mois et projets
- [x] En-têtes de sécurité (23af3d8)
- [x] Contrôle du mois, versements de l'employeur, projets financés par l'épargne (6a368e5, a2d6d69, 51acd4b)

#### v1.12.1 — 05/11/2026
- [x] Service worker compatible Safari (redirection Cloudflare) et réparation de la page blanche (5c88711, 9b2b378, b90d657)

### v1.13 — 06/11/2026 — Nouvelle navigation
- [x] Onglet Foyer, pointage en haut du Foyer, bouton + en cartes (f202e0f)

### v1.14 — 06/11/2026 — Visuels et thèmes
- [x] Barres du foyer, reste à vivre en barres, progression de Ce mois, 4 nouveaux thèmes (2b8ef8d, 35b1202, 91d4dc3)

### v1.15 — 06/11/2026 — Contrôle du mois fiable
- [x] Régularisation en attente, détail ligne par ligne, charges pointées seulement, « D'où vient l'écart » (a4b3701, 8e8bdef, 38d4e6c, 341bc11)

#### v1.15.1 — 06/11/2026
- [x] Affichage du contrôle : remboursements comptés et visibles, ordre des lignes, arrondis, seuil de 1 € (29d0bc2, 22c7abf, 8a8698d, 8b770d8)

### v1.16 — 12/11/2026 — Suivi de version
- [x] Sources dans `src/` (page, `static/sw.js`, manifeste, icônes, `_headers`) ; `node build.mjs` génère `public/`, commité
- [x] Le build recalcule l'empreinte CSP du script et vérifie que `sw.js` est inchangé
- [x] `src/changelog.json` : toutes les versions ci-dessus, rédigées pour l'utilisateur
- [x] Numéro de version affiché dans Réglages, et fiche « Nouveautés » après l'installation d'une mise à jour
- [x] `tests/run.sh` : syntaxe, empreinte CSP, parcours en mode démo (onglets, Foyer, bouton +), scénarios du contrôle du mois
- [x] README : organisation du dépôt, procédure de livraison, règle du service worker
- [x] Publication Cloudflare : `wrangler.jsonc` (Worker « patrimoine ») publie le dossier `public` en fichiers statiques

### v1.17 — Sauvegarde automatique sur Google Drive (spécifiée le 15/11/2026, à lancer)

Sur le modèle de MyCellar (v2.2), avec une API **dédiée** à Patrimoine : un projet Google « Patrimoine » et un Worker Cloudflare `patrimoine-auth`, sans rien partager avec MyCellar (dossier Drive, autorisation et service séparés).

**Principe**
- Les sauvegardes sont le même fichier chiffré que la sauvegarde manuelle (illisible sans le mot de passe du coffre). Elles vont directement de l'iPhone vers le dossier caché de Patrimoine dans ton Google Drive, avec le seul droit `drive.appdata` : l'app ne voit rien d'autre du Drive.
- Le Worker `patrimoine-auth` ne sert qu'à échanger et renouveler l'autorisation Google avec le secret du projet. Il ne stocke rien, ne voit jamais les sauvegardes et refuse toute demande qui ne vient pas de l'adresse de l'app.
- L'autorisation de longue durée est rangée dans l'iPhone, chiffrée avec la clé du coffre. Elle ne figure pas dans les fichiers de sauvegarde.

**Fonctionnement**
- [ ] Rythme : envoi quelques minutes après une modification, ou quand l'app passe en arrière-plan. Une nouvelle version par heure au plus (sinon la plus récente est mise à jour). Rien n'est envoyé si les données n'ont pas changé. 30 versions gardées. Nouvel essai 15 minutes après un échec.
- [ ] Réglages › Données de l'application › **Sauvegarde automatique** : connecter Google Drive, état (dernière sauvegarde réussie, dernier échec et sa raison), « Sauvegarder maintenant », « Restaurer une version », « Déconnecter Google Drive » (l'autorisation est révoquée, les sauvegardes déjà faites restent dans le Drive).
- [ ] Nouvel iPhone : sur l'écran de création du coffre, « Restaurer depuis Google Drive » › compte Google › choix de la version › mot de passe du coffre. La sauvegarde automatique reprend aussitôt.
- [ ] Une sauvegarde automatique récente compte comme une sauvegarde : l'étape « Exporter une sauvegarde » de Ce mois et le point d'attention « Dernière sauvegarde il y a… » en tiennent compte.
- [ ] Point d'attention si la sauvegarde automatique échoue depuis plus de 7 jours, ou si une reconnexion est nécessaire.
- [ ] La sauvegarde manuelle (export d'un fichier) reste disponible.

**Technique**
- [ ] Worker `worker/patrimoine-auth.js` repris de MyCellar : routes `/token` et `/refresh`, PKCE, adresse de retour fixée côté Worker, origine autorisée = adresse de l'app.
- [ ] `src/backup-config.json` : identifiant OAuth et adresse du Worker (non secrets). Sans eux, l'app affiche « non configurée » et tout le reste fonctionne normalement.
- [ ] Politique de sécurité (CSP) : autoriser seulement l'API Google Drive, le renouvellement Google et le Worker. `sw.js` inchangé.
- [ ] Pages publiques `confidentialite` et `conditions`, exigées par Google pour publier l'application OAuth.
- [ ] `tests/run.sh` : connexion, envoi, mise à jour dans l'heure, rotation des 30 versions, rien envoyé sans changement, reconnexion, restauration, avec Google et le Worker simulés.
- [ ] Guide pas à pas `docs/sauvegarde-google-drive.md`, adapté à Patrimoine.

**Mise en place (à faire par toi, une fois, environ 30 minutes)**
- [ ] Projet Google Cloud « Patrimoine » : API Google Drive activée, écran de consentement « Externe » publié « En production » (sans logo), droit `drive.appdata`, identifiant OAuth « Application Web » avec l'adresse de l'app.
- [ ] Worker Cloudflare `patrimoine-auth` avec le code du dépôt et ses variables (`CLIENT_ID`, `CLIENT_SECRET` en secret, `ALLOWED_ORIGIN`, `REDIRECT_URI`).
- [ ] Me transmettre l'identifiant OAuth et l'adresse du Worker, pour renseigner `src/backup-config.json` (le secret ne quitte jamais Cloudflare).
