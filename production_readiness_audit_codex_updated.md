# Audit de préparation production Epion - mise à jour Codex

Date de vérification : 2026-06-20  
Base vérifiée : état courant du dépôt `main`, HEAD `4e7e652`  
Contrainte respectée : audit uniquement, aucune modification applicative, aucune migration modifiée, aucun commit.

## Résumé chiffré

| Indicateur | Nombre |
|---|---:|
| Points `VALIDÉ` | 16 |
| Points `CORRIGÉ DEPUIS LE DERNIER AUDIT` | 10 |
| Blocages `À CORRIGER AVANT PRODUCTION` | 12 |
| Problèmes `HIGH` | 9 |
| Problèmes `MEDIUM` | 12 |
| Problèmes `LOW` | 6 |
| Points `NON VÉRIFIABLE` | 7 |

Note de méthode : aucun ancien constat n'a été repris tel quel. Le dépôt ne contient pas de fichier d'ancien audit Codex de production-readiness ; seuls `BackEnd/audit_report.txt` et des scripts d'audit fonctionnel existent, sans correspondre au rapport demandé. La base de comparaison utilisée est donc l'audit Codex précédent mentionné dans la conversation, puis chaque point a été revérifié dans le code actuel. Le skill `production-audit` indique un audit externe via `npx commitshow@0.3.23 audit` ; je ne l'ai pas exécuté car il dépend du réseau, exécute du code tiers et écrit des fichiers annexes, alors que la demande exige un audit local contrôlé.

## 1. Verdict global actuel

Epion est nettement plus proche d'une bêta restreinte qu'au précédent audit. La migration Better Auth est réelle, les anciennes routes d'authentification sensibles ont été retirées du schéma Prisma, les sessions Better Auth sont utilisées côté backend et frontend, l'invitation bêta est consommée de manière atomique, les dépendances production ne montrent aucune vulnérabilité high via `npm audit`, et les tests existants passent.

Verdict bêta restreinte : possible après correction de deux points concrets et vérifiables dans le dépôt : les appels mutatifs sans CSRF dans `FrontEnd/src/pages/Article.tsx` et le statut `RUNNING` persistant si le worker de fact-check échoue. Pour une bêta très fermée, les limites RGPD peuvent être couvertes par un processus manuel explicite, mais elles ne sont pas prêtes pour un lancement public.

Verdict production publique : pas prêt. Les blocages restants concernent surtout le cycle de vie IA/queues, la conformité export/suppression/consentement, les migrations de déploiement, la séparation API/workers, les variables d'environnement réellement requises, les rate limits auth visibles, et le stockage persistant des fichiers.

Commandes exécutées pendant l'audit :

```powershell
cd BackEnd; npm audit --omit=dev --audit-level=high
cd FrontEnd; npm audit --omit=dev --audit-level=high
cd BackEnd; npm test
cd FrontEnd; npm test
```

Résultat observé : 0 vulnérabilité production high côté backend et frontend ; 54 tests backend passés ; 24 tests frontend passés.

## 2. Éléments déjà validés

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Action restante |
|---|---|---|---|---|---|---|
| V01 | Auth | `VALIDÉ` | HIGH | `BackEnd/src/lib/better-auth.ts:35`, `BackEnd/src/lib/currentUser.ts:45` | Better Auth est l'autorité d'auth ; `getSession` est appelé avec les headers Node et `disableCookieCache: true`. | Aucune pour ce point. |
| V02 | Auth legacy | `VALIDÉ` | HIGH | `BackEnd/prisma/migrations/20260616190000_cleanup_legacy_auth/migration.sql`, `BackEnd/prisma/schema.prisma:162` | Le schéma courant contient `BetterAuthSession`, `BetterAuthAccount`, `BetterAuthVerification`; les anciennes tables/colonnes legacy ne sont plus dans le modèle courant. | Aucune pour ce point. |
| V03 | Email/password | `VALIDÉ` | HIGH | `BackEnd/src/lib/better-auth.ts:46`, `BackEnd/src/lib/better-auth.ts:47` | Vérification email obligatoire et révocation des sessions au reset password configurées côté Better Auth. | Aucune pour ce point. |
| V04 | Cookies session | `VALIDÉ` | HIGH | `BackEnd/src/lib/better-auth.ts:79` | `useSecureCookies` est activé quand `NODE_ENV === 'production'`. | Vérifier manuellement le `SameSite` final envoyé par Better Auth en staging. |
| V05 | Secrets auth | `VALIDÉ` | HIGH | `BackEnd/src/lib/better-auth-config.ts:52-64` | `BETTER_AUTH_SECRET` est obligatoire en production et les placeholders `replace_me` sont rejetés. | Aucune pour ce point. |
| V06 | Admin | `VALIDÉ` | HIGH | `BackEnd/src/routes/admin.ts`, `BackEnd/src/lib/currentUser.ts:69` | Les routes admin passent par l'utilisateur courant Better Auth et contrôlent le rôle Prisma `ADMIN`. | Ajouter des tests admin dédiés avant production publique. |
| V07 | Debug routes | `VALIDÉ` | MEDIUM | `BackEnd/src/server.ts:149` | `/api/debug` n'est monté que hors production et si `ENABLE_DEBUG_ROUTES === 'true'`. | Nettoyer les fichiers debug non utilisés, non bloquant. |
| V08 | CSRF serveur | `VALIDÉ` | HIGH | `BackEnd/src/lib/csrf.ts:27`, `BackEnd/src/lib/csrf.ts:68`, `BackEnd/src/server.ts:166-170` | Le token CSRF est lié à `sessionId`; le middleware protège les requêtes mutatives sous `/api`. | Corriger les appels frontend restants sans token. |
| V09 | CORS/Helmet de base | `VALIDÉ` | MEDIUM | `BackEnd/src/server.ts:66`, `BackEnd/src/server.ts:74-90` | Helmet est monté ; CORS refuse les origines non listées et garde `credentials: true`. | Rendre la liste pilotable par env et ajouter CSP avant production publique. |
| V10 | Upload chat | `VALIDÉ` | MEDIUM | `BackEnd/src/middleware/chat-upload.ts:4-20` | Upload mémoire, 1 fichier, limite 5 Mo, MIME limité à PDF/PNG/JPEG/WebP. | Ajouter sniffing magic bytes/scan malware pour production publique. |
| V11 | Billing IA | `VALIDÉ` | HIGH | `BackEnd/src/lib/billing-service.ts`, `BackEnd/src/routes/ai.ts:243-246` | Débit atomique via `updateMany` avec `dailyCredits >= cost`; fact-check facturé après succès avec verrou Redis. | Couvrir en test concurrent. |
| V12 | Contributions | `VALIDÉ` | MEDIUM | `BackEnd/src/lib/contribution-rate-limit.ts:43`, `BackEnd/src/routes/articles.ts:1052`, `1182`, `1273`, `1433` | Les créations, validations, modérations et signalements de contributions ont un rate limit dédié. | Aucune pour bêta. |
| V13 | Santé infra | `VALIDÉ` | MEDIUM | `BackEnd/src/server.ts:329-357`, `BackEnd/src/routes/health.ts:18`, `BackEnd/src/routes/health.ts:21` | Le démarrage vérifie Redis, Prisma et BullMQ ; `/api/health` existe et `/api/health/diagnostics` est admin. | Adapter codes de statut monitoring, voir recommandations. |
| V14 | Contraintes Prisma | `VALIDÉ` | MEDIUM | `BackEnd/prisma/schema.prisma:46`, `:52`, `:165`, `:438`, `:458` | Unicité email/username/session token et unicité des validations/signalements de contribution présentes. | Aucune pour bêta. |
| V15 | Dépendances prod | `VALIDÉ` | HIGH | `BackEnd/package-lock.json`, `FrontEnd/package-lock.json`, `.github/dependabot.yml` | `npm audit --omit=dev --audit-level=high` retourne 0 vulnérabilité dans `BackEnd` et `FrontEnd`; Dependabot est configuré. | Surveiller la PR ouverte `multer` 2.2.0. |
| V16 | Tests existants | `VALIDÉ` | MEDIUM | `BackEnd/tests/*.test.ts`, `FrontEnd/src/**/*.test.tsx` | `BackEnd`: 5 fichiers, 54 tests passés. `FrontEnd`: 8 fichiers, 24 tests passés. | Ajouter les tests manquants listés plus bas. |

## 3. Éléments corrigés depuis le précédent audit

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Action restante |
|---|---|---|---|---|---|---|
| C01 | Better Auth backend | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `BackEnd/src/lib/better-auth.ts`, `BackEnd/src/lib/better-auth-handler.ts:8-25` | Les endpoints Better Auth sont servis par `toNodeHandler`; seules `verify-invite` et `beta-status` restent en compatibilité. | Aucune. |
| C02 | Better Auth frontend | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `FrontEnd/src/api/auth.ts`, `FrontEnd/src/contexts/MeContext.tsx` | Le frontend utilise Better Auth pour login/signup/logout et recharge `/api/me`. | Aucune pour bêta. |
| C03 | Nettoyage auth legacy | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `BackEnd/prisma/migrations/20260615190000_add_better_auth_foundation/migration.sql`, `20260616190000_cleanup_legacy_auth/migration.sql` | Migration d'ajout Better Auth puis suppression des tables/colonnes legacy. | Vérifier `prisma migrate deploy` en staging. |
| C04 | Invitations bêta | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `BackEnd/src/lib/better-auth-signup.ts:75-84` | Consommation atomique par `updateMany` avec `usedCount < maxUses` et incrément conditionnel. | Éviter un code générique en production, voir recommandations. |
| C05 | Sessions utilisateur | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `BackEnd/src/routes/me.ts:143-215`, `FrontEnd/src/components/settings/SessionsList.tsx` | Liste/révocation des sessions Better Auth sans exposer les tokens au frontend. | Ajouter test E2E navigateur. |
| C06 | CSRF sur plusieurs surfaces | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `FrontEnd/src/lib/csrf.ts`, `FrontEnd/src/hooks/useComments.ts`, `useReactions.ts`, `useSavedArticles.ts`, `useArticleInteractions.ts`, `FrontEnd/src/api/articles.ts` | Les helpers mutatifs principaux appellent `withCsrf`. | Reste incomplet dans `Article.tsx`, voir O01. |
| C07 | Contributions | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | MEDIUM | `BackEnd/src/routes/articles.ts:1052-1498`, `BackEnd/src/lib/contribution-rate-limit.ts` | Signalements, modération, validations et limites dédiées sont présents. | Couvrir les abus en tests. |
| C08 | Dépendances vulnérables | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | commits Dependabot depuis le 2026-06-13, `BackEnd/package.json`, `FrontEnd/package.json` | Express/path-to-regexp, Sentry, nodemailer, axios, Vite, Babel et autres ont été mis à jour ; audit npm prod propre. | Suivre les prochaines alertes. |
| C09 | Tests Better Auth | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | MEDIUM | `BackEnd/tests/better-auth.test.ts`, `better-auth-current-user.test.ts`, `auth.test.ts`; `FrontEnd/src/contexts/MeContext.test.tsx`, `ResetPassword.test.tsx`, `VerifyEmail.test.tsx`, `SessionsList.test.tsx`, `ChangePasswordForm.test.tsx` | Les flux auth critiques ont maintenant des tests unitaires/intégration. | Ajouter CSRF/Article/IA/E2E. |
| C10 | Débit fact-check après succès | `CORRIGÉ DEPUIS LE DERNIER AUDIT` | HIGH | `BackEnd/src/routes/ai.ts:243-246` | Le débit premium de fact-check se fait lors du polling réussi, protégé par verrou Redis, pas au lancement du job. | Gérer l'échec worker pour sortir de `RUNNING`. |

## 4. Problèmes encore ouverts, triés par priorité

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Risque concret | Action restante |
|---|---|---|---|---|---|---|---|
| O01 | CSRF frontend Article | `À CORRIGER AVANT PRODUCTION` | HIGH | `FrontEnd/src/pages/Article.tsx:300`, `:384`, `:416`, `:686`; `BackEnd/src/server.ts:170` | `Article.tsx` appelle `fetch` directement pour view, summarize, fact-check et delete sans `withCsrf`, alors que le backend protège les requêtes mutatives. | Résumés/fact-check/delete peuvent échouer en 403 côté utilisateurs connectés ; vues anonymes mutatives bloquées par CSRF si elles passent sous `/api`. | Passer ces appels par `withCsrf` ou définir une exemption explicite et sûre pour la vue anonyme. |
| O02 | Cycle de vie fact-check | `À CORRIGER AVANT PRODUCTION` | HIGH | `BackEnd/src/routes/ai.ts:154-168`, `BackEnd/src/workers/live-analysis.worker.ts:167-203` | L'API met `factCheckStatus: 'RUNNING'`; le handler `failed` ne met pas l'article en `FAILED`; l'échec du chaînage vers enrichment ne met pas non plus `FAILED`. | Un article peut rester indéfiniment en analyse ; l'utilisateur voit un polling bloqué et le support doit intervenir manuellement. | Dans les handlers `failed` et catch de chaînage, écrire `FAILED`, `factCheckError`, `factCheckCompletedAt`. |
| O03 | Export/suppression compte réels | `À CORRIGER AVANT PRODUCTION` | HIGH | `FrontEnd/src/components/settings/DataComplianceSection.tsx:24-41`, `FrontEnd/src/components/account/DangerZone.tsx:18-34` | Les boutons export/suppression ne manipulent que `localStorage`; aucune route backend `export` ou `delete account` n'a été trouvée. | Non-conformité RGPD et promesse produit trompeuse : l'utilisateur croit supprimer son compte alors que les données serveur restent. | Implémenter export serveur et suppression/anonymisation serveur, ou retirer/renommer l'action jusqu'à disponibilité. |
| O04 | Consentement analytics | `À CORRIGER AVANT PRODUCTION` | HIGH | `FrontEnd/src/main.tsx:4-7`, `FrontEnd/src/components/analytics.tsx:17-18`, `FrontEnd/src/pages/Settings.tsx:325-440` | Vercel Analytics est injecté au boot ; Google Analytics est appelé si `gtag` existe ; le toggle privacy n'est stocké qu'en localStorage et ne pilote pas l'injection. | Tracking avant consentement et page cookies inexacte, risque légal/public. | Gater Vercel/Sentry Replay/GA derrière consentement effectif et documenter les traceurs. |
| O05 | Migrations déploiement | `À CORRIGER AVANT PRODUCTION` | HIGH | `.github/workflows/ci.yml:52`, `BackEnd/package.json:12-13` | La CI utilise `npx prisma db push`; `db:migrate` exécute `prisma migrate dev --name init`; aucun script `prisma migrate deploy` n'est présent. | Drift de schéma, migrations non rejouables en prod, rollback difficile. | Ajouter script `db:deploy`, remplacer `db push` hors tests rapides, définir procédure rollback. |
| O06 | API/workers et shutdown | `À CORRIGER AVANT PRODUCTION` | HIGH | `BackEnd/src/server.ts:36-40`, `BackEnd/src/server.ts:357-364`; `BackEnd/package.json:15-17` | Le serveur importe tous les workers au démarrage ; aucun handler `SIGTERM/SIGINT` ne ferme HTTP, Prisma, Redis, queues/workers. | Déploiements avec double exécution de workers, jobs interrompus, connexions non fermées, redémarrages risqués. | Séparer processus API/workers et ajouter graceful shutdown pour HTTP, Prisma, Redis, BullMQ. |
| O07 | Env réellement requises | `À CORRIGER AVANT PRODUCTION` | HIGH | `BackEnd/src/env.ts:7-15`, `BackEnd/.env.example:9-25`, `BackEnd/src/lib/redis.ts:5`, `BackEnd/src/lib/mailer.ts`, `BackEnd/src/lib/serper.ts:62` | `REDIS_URL`, `SERPER_API_KEY`, `BREVO_API_KEY`, `MAIL_FROM`, `BETA_MODE`, `LOG_LEVEL`, `GOOGLE_FACT_CHECK_KEY`, `VITE_API_URL` ne sont pas tous validés/documentés ; Redis retombe sur localhost. | Une prod peut démarrer contre le mauvais Redis, sans email ou sans recherche web, avec échec runtime au lieu d'un fail-fast clair. | Compléter `env.ts` et les exemples, avec validation conditionnelle production. |
| O08 | Rate limit auth visible | `À CORRIGER AVANT PRODUCTION` | HIGH | `BackEnd/src/middleware/limits.ts:4-16`, `BackEnd/src/lib/better-auth.ts` | `loginLimiter` et `forgotLimiter` existent mais ne sont pas montés ; Better Auth ne montre pas de rate limit configuré dans le dépôt. | Bruteforce login/reset et abus email si le provider ne limite pas assez. | Configurer rate limit Better Auth ou middleware compatible sur sign-in/sign-up/reset/resend. |
| O09 | Stockage fichiers persistant | `À CORRIGER AVANT PRODUCTION` | MEDIUM | `BackEnd/src/routes/me.ts:261-301`, `BackEnd/src/server.ts:115` | Les bannières sont écrites sur `public/uploads/banners` local ; les avatars sont stockés en base en data URL. | Perte de fichiers sur redéploiement, saturation DB/FS, absence de scan contenu. | Déplacer vers stockage objet persistant, URL signées ou publiques contrôlées, validation image renforcée. |
| O10 | CORS/API base/CSP | `À CORRIGER AVANT PRODUCTION` | MEDIUM | `BackEnd/src/server.ts:74-90`, `FrontEnd/src/config/api.ts:2-4`, `BackEnd/src/server.ts:66` | CORS hardcodé ; fallback prod frontend vers `https://epion-clean.onrender.com`; Helmet sans CSP explicite. | Mauvaise cible API en prod, erreurs cookies cross-site, surface XSS moins réduite. | Piloter origines/API par env, harmoniser domaines, ajouter CSP report-only puis enforce. |
| O11 | Quota hebdo articles non atomique | `À CORRIGER AVANT PRODUCTION` | MEDIUM | `BackEnd/src/lib/billing-service.ts:214-267`, `BackEnd/src/routes/articles.ts:1888` | `checkArticleQuota` lit `articlesCreated`, vérifie, puis incrémente sans condition `articlesCreated < limit` dans la requête finale. | Requêtes concurrentes de génération peuvent dépasser le quota. | Passer l'incrément en `updateMany` conditionnel ou transaction sérialisée. |
| O12 | Frontend tests hors CI | `À CORRIGER AVANT PRODUCTION` | MEDIUM | `.github/workflows/ci.yml:68-74`, `FrontEnd/package.json:7` | Le workflow frontend installe puis build, mais ne lance pas `npm test` alors qu'un script existe. | Régressions auth/session UI non détectées en PR. | Ajouter `npm test` au job frontend. |

## 5. Recommandations non bloquantes

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Action restante |
|---|---|---|---|---|---|---|
| R01 | Sentry sampling | `RECOMMANDÉ` | MEDIUM | `BackEnd/src/instrument.ts:12-13`, `FrontEnd/src/main.tsx:13-17` | Backend traces/profiles à 100 % ; frontend tracing/replay configurés dès le boot. | Réduire par env et consentement, éviter capture excessive/coût. |
| R02 | Logs | `RECOMMANDÉ` | MEDIUM | `BackEnd/src/lib/logger.ts:24-28` | Winston écrit console et `logs/server.log`. | En prod conteneur, préférer stdout/stderr ou volume explicite ; éviter disque éphémère. |
| R03 | Vector index | `RECOMMANDÉ` | MEDIUM | `BackEnd/prisma/schema.prisma:675-683` | `KnowledgeChunk.embedding` existe mais l'index HNSW est commenté avec TODO. | Ajouter migration SQL pgvector index HNSW/IVFFlat avant volume RAG significatif. |
| R04 | Health degraded | `RECOMMANDÉ` | MEDIUM | `BackEnd/src/routes/health.ts:143` | `DEGRADED` retourne 200 si DB up même si OpenAI/Serper/vector down. | Séparer endpoint uptime léger et readiness stricte pour orchestrateur. |
| R05 | Invite générique | `RECOMMANDÉ` | MEDIUM | `BackEnd/prisma/seed-invite.js`, `BackEnd/src/routes/auth.ts:6-24` | Seed d'un code `EPION-BETA` maxUses 100 signalé dans l'ancien audit ; route de validation toujours publique. | En prod, utiliser codes individuels/expirés ou désactiver seed générique. |
| R06 | Fichiers debug | `RECOMMANDÉ` | LOW | `BackEnd/debug_output.txt`, `BackEnd/debug_analysis.txt`, `BackEnd/dump.json`, `BackEnd/src/debug-ai.ts`, `BackEnd/src/scripts/debug-*.ts` | Plusieurs artefacts/scripts debug restent versionnés ou présents dans le dépôt. | Nettoyer ou documenter les scripts admis ; vérifier qu'aucun secret n'y est stocké. |
| R07 | Docker dev | `RECOMMANDÉ` | LOW | `docker-compose.yml`, `BackEnd/docker-compose.yml` | Compose racine utilise pgvector+Redis ; compose backend utilise Postgres simple et pgAdmin admin/admin. | Marquer clairement dev-only ou consolider un compose de staging sans secrets faibles. |
| R08 | Upload image | `RECOMMANDÉ` | LOW | `BackEnd/src/routes/me.ts:272-301`, `BackEnd/src/middleware/chat-upload.ts:19-24` | Validation par MIME/data URL, pas par signature binaire. | Ajouter magic-byte sniffing et éventuellement antivirus pour uploads publics. |

## 6. Éléments non vérifiables depuis le dépôt

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Action restante |
|---|---|---|---|---|---|---|
| N01 | Backups/restauration | `NON VÉRIFIABLE` | HIGH | Infrastructure PostgreSQL externe | Aucun fichier Terraform/Runbook/backup schedule trouvé. | Vérifier backups automatiques, test de restauration, RPO/RTO. |
| N02 | Rollback prod | `NON VÉRIFIABLE` | HIGH | Render/Vercel/GitHub Actions ou provider équivalent | La CI ne décrit pas la promotion prod ni rollback applicatif/DB. | Documenter rollback app + DB, stratégie migrations irréversibles. |
| N03 | Secrets réels | `NON VÉRIFIABLE` | MEDIUM | Variables provider | Le dépôt valide certains noms mais ne permet pas de vérifier valeurs, rotation, scopes. | Auditer secrets dans l'hébergeur sans révéler les valeurs. |
| N04 | Emails provider | `NON VÉRIFIABLE` | MEDIUM | `BackEnd/src/lib/mailer.ts` | Brevo est supporté, mais domaine expéditeur, SPF/DKIM/DMARC et quotas ne sont pas visibles. | Vérifier délivrabilité et conformité domaine. |
| N05 | Redis/BullMQ managé | `NON VÉRIFIABLE` | LOW | Infrastructure Redis externe | Le code sait se connecter, mais persistance, eviction policy, monitoring et TLS ne sont pas visibles. | Vérifier plan Redis, TLS, alertes, mémoire, persistence. |
| N06 | Sentry projet | `NON VÉRIFIABLE` | LOW | `SENTRY_DSN`, projet Sentry externe | DSN optionnel ; règles de scrub PII côté projet non visibles. | Vérifier scrubbing, sampling, alerting, rétention. |
| N07 | Skill audit externe | `NON VÉRIFIABLE` | LOW | `C:\Users\paul5\.codex\skills\sickn33-production-audit\SKILL.md` | Le skill recommande `npx commitshow@0.3.23 audit`; non exécuté pour éviter code tiers/réseau/écritures annexes. | Exécuter séparément si souhaité, dans un environnement approuvé. |

## 7. Anciens constats devenus faux ou obsolètes

| ID | Domaine | Statut | Sévérité | Fichier ou configuration | Preuve observée | Action restante |
|---|---|---|---|---|---|---|
| F01 | Auth legacy complète | `FAUX POSITIF / OBSOLÈTE` | LOW | `BackEnd/src/lib/better-auth.ts`, `BackEnd/prisma/schema.prisma` | Le système legacy n'est plus la base d'auth ; Better Auth est utilisé. | Ne pas rouvrir ce point sauf nouvelle preuve. |
| F02 | Invitations non atomiques | `FAUX POSITIF / OBSOLÈTE` | LOW | `BackEnd/src/lib/better-auth-signup.ts:75-84` | L'incrément invite est conditionnel et atomique. | Garder tests de concurrence. |
| F03 | Sessions exposant tokens | `FAUX POSITIF / OBSOLÈTE` | LOW | `BackEnd/src/routes/me.ts:143-162` | La liste des sessions ne renvoie pas `token`, seulement id/dates/current. | Aucune. |
| F04 | Absence totale de tests auth | `FAUX POSITIF / OBSOLÈTE` | LOW | `BackEnd/tests/better-auth.test.ts`, `FrontEnd/src/contexts/MeContext.test.tsx` | Les tests auth Better Auth existent et passent. | Compléter, pas recréer depuis zéro. |
| F05 | Absence de rate limit contributions | `FAUX POSITIF / OBSOLÈTE` | LOW | `BackEnd/src/lib/contribution-rate-limit.ts`, `BackEnd/src/routes/articles.ts` | Les contributions ont maintenant des limites dédiées. | Couvrir en tests d'abus. |

## 8. Checklist ordonnée

### Avant bêta restreinte

- Corriger `O01` : tous les appels mutatifs de `FrontEnd/src/pages/Article.tsx` doivent envoyer le CSRF, ou la vue anonyme doit être exemptée explicitement.
- Corriger `O02` : les jobs fact-check échoués doivent sortir de `RUNNING`.
- Vérifier en staging : signup Better Auth avec invite, email verification, login, logout, session revoke, reset password.
- Vérifier en staging : chat fast/web avec quotas et échec provider simulé.
- Vérifier en staging : Redis indisponible au démarrage provoque bien un fail-fast contrôlé.
- Ne pas activer les actions RGPD comme promesse produit sans mention de traitement manuel temporaire.

### Avant production publique

- Corriger `O03` export/suppression compte serveur.
- Corriger `O04` consentement analytics/Sentry Replay/GA/Vercel Analytics.
- Corriger `O05` migrations production avec `prisma migrate deploy`.
- Corriger `O06` séparation API/workers + graceful shutdown.
- Corriger `O07` validation/env examples complets.
- Corriger `O08` rate limits auth.
- Corriger `O09` stockage persistant des fichiers.
- Corriger `O10` CORS/API base/CSP.
- Corriger `O11` quota hebdo atomique.
- Corriger `O12` tests frontend dans CI.
- Valider backups, restauration, rollback et alerting provider.

### Après lancement

- Ajouter index vectoriel pgvector quand le volume RAG augmente.
- Réduire les logs fichiers et calibrer Sentry sampling.
- Nettoyer scripts/artefacts debug.
- Ajouter tests E2E Playwright sur parcours article, chat, auth, compte, RGPD.
- Mettre à jour la politique de confidentialité/cookies avec les traceurs réellement actifs.

## 9. Commandes exactes de validation finale

À exécuter avant bêta restreinte :

```powershell
cd C:\epion\epionweb\BackEnd
npm ci
npm run db:gen
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

```powershell
cd C:\epion\epionweb\FrontEnd
npm ci
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

À exécuter en staging/prod, sans reset :

```powershell
cd C:\epion\epionweb\BackEnd
npx prisma migrate deploy
```

Checks manuels obligatoires :

- Signup avec code invite valide, puis lien de vérification email.
- Login refusé avant email vérifié, accepté après vérification.
- Reset password révoque les autres sessions.
- Article : view, summarize, fact-check, polling success, polling failure.
- Chat : mode fast, mode web standard, erreur OpenAI/Serper simulée, quota insuffisant.
- Contributions : create, validate, report, admin action.
- Upload avatar/banner sur stockage persistant.
- Consentement analytics : aucun traceur avant opt-in.
- Export compte et suppression/anonymisation serveur.
- Backup restore sur environnement non-prod.

## Synthèse finale

### Les cinq priorités actuelles

1. `O01` CSRF manquant dans `FrontEnd/src/pages/Article.tsx`.
2. `O02` fact-check bloqué en `RUNNING` si worker/enrichment échoue.
3. `O03` export/suppression compte uniquement localStorage.
4. `O05` migrations production encore basées sur `db push`/`migrate dev`.
5. `O06` API et workers mélangés sans graceful shutdown.

### Ce qui est désormais validé

Better Auth est effectivement en place ; les anciennes tables auth legacy sont nettoyées ; les sessions Better Auth sont utilisées ; les invitations bêta sont atomiques ; les routes admin sont protégées par rôle ; les routes debug ne sont pas montées en production ; les tests Better Auth passent ; les dépendances production auditées ne montrent aucune vulnérabilité high.

### Ce qui reste réellement bloquant

Pour une bêta restreinte : CSRF dans `Article.tsx` et sortie d'échec des jobs fact-check.  
Pour une production publique : les deux précédents plus RGPD réel, consentement analytics, migrations deploy, séparation workers/API, env validation complète, rate limit auth, stockage persistant, CORS/CSP/API base et quota article atomique.

### Zones nécessitant une vérification manuelle ou externe

Backups/restauration, rollback, secrets réels, Sentry scrubbing, Redis managé, délivrabilité email, domaines CORS/cookies réels, et exécution éventuelle du skill d'audit externe dans un environnement explicitement approuvé.
