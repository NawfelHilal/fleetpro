# Changelog FleetPro

Ce fichier trace les principales versions techniques du projet FleetPro ainsi que les évolutions, correctifs et changements d’exploitation associés.

FleetPro étant composé de plusieurs briques pouvant évoluer indépendamment, le versionnement est réalisé par périmètre :

- `mobile-vX.Y.Z` pour l’application Expo / React Native ;
- `backend-vX.Y.Z` pour l’API Django REST Framework ;
- `gps-vX.Y.Z` pour le service temps réel NestJS / Socket.IO ;
- `infra-vX.Y.Z` pour Docker, Nginx, CI/CD, Scaleway, SonarQube et le monitoring.

Les versions suivent une convention inspirée du Semantic Versioning :

- `MAJOR` : rupture importante de compatibilité ou changement majeur d’architecture ;
- `MINOR` : ajout d’une fonctionnalité compatible ;
- `PATCH` : correction d’anomalie, de sécurité ou de configuration.

Le numéro de version fournit une référence lisible pour chaque composant, tandis que le SHA Git permet d’identifier précisément l’état du code correspondant.

---

## État des versions

| Version | SHA court | Date du commit | État | Périmètre |
| --- | --- | --- | --- | --- |
| `mobile-v1.0.0` | `ab3d55e` | 2026-07-19 | Tag existant | Application mobile et pipeline EAS |
| `backend-v1.0.0` | `c127d07` | 2026-08-17 | Version formalisée Bloc 4 | API Django REST, Swagger, tests et CI |
| `gps-v1.0.0` | `c127d07` | 2026-08-17 | Version formalisée Bloc 4 | Service GPS, Socket.IO, Redis, tests et sécurité |
| `infra-v1.0.0` | `c127d07` | 2026-08-17 | Version formalisée Bloc 4 | Docker, Scaleway, Nginx, CI/CD, SonarQube et Uptime Kuma |

> Le tag `mobile-v1.0.0` existait avant la formalisation de ce changelog et n’a pas été déplacé afin de préserver l’historique Git.
>
> Les versions `backend-v1.0.0`, `gps-v1.0.0` et `infra-v1.0.0` correspondent à l’état stable du dépôt retenu lors de la mise en place du versionnement par composant.
>
> Une version ne doit être indiquée comme « déployée » dans ce fichier que lorsqu’une preuve de son déploiement est disponible.

---

# Versions

## [backend-v1.0.0]

### Ajouté

- API Django REST structurée autour des modules principaux de FleetPro.
- Documentation OpenAPI / Swagger via `drf-spectacular`.
- Endpoints de documentation :
  - `/api/schema/`
  - `/api/docs/`
  - `/api/redoc/`
- Endpoint de santé backend `/api/v1/health/`.
- Vérification de la disponibilité de la base PostgreSQL dans le healthcheck.
- Tests automatisés backend.
- Contrôle du seuil de couverture dans la CI.
- Contrôles de qualité et de sécurité :
  - `ruff`
  - `bandit`
  - `pip-audit`
  - tests automatisés avec couverture.

### Corrigé / amélioré

- Stabilisation de la configuration nécessaire au fonctionnement du backend dans l’environnement Docker / Scaleway.
- Renforcement de la configuration des secrets utilisés par l’application.
- Ajout de mécanismes facilitant le diagnostic des analyses de qualité réalisées dans la CI.

### Sécurité

- Variables sensibles exclues du dépôt.
- Utilisation de fichiers `.env` locaux ou de production non versionnés.
- Exemples de configuration fournis sans secrets réels.
- Utilisation de GitHub Secrets dans la CI/CD.
- Authentification JWT pour les échanges nécessitant une authentification.
- Audit Python automatisé avec `pip-audit`.
- Analyse du code avec `Bandit`.

### Validation

La version est contrôlée par la chaîne CI backend comprenant notamment :

- installation des dépendances ;
- Ruff ;
- Bandit ;
- pip-audit ;
- tests Django ;
- mesure de couverture.

### Preuves principales

- `backend/requirements.txt`
- `backend/requirements-dev.txt`
- `backend/core/settings.py`
- `backend/core/urls.py`
- `backend/apps/rides/health.py`
- `backend/tests/`
- `.github/workflows/ci.yml`

---

## [gps-v1.0.0]

### Ajouté

- Service GPS temps réel basé sur NestJS et Socket.IO.
- Gestion des connexions temps réel.
- Authentification JWT des connexions WebSocket.
- Gestion de la présence des chauffeurs avec Redis.
- Stockage temporaire des positions GPS.
- Recherche de chauffeurs à proximité via Redis.
- Expiration automatique des positions afin de limiter la présence de données GPS obsolètes.
- Endpoint de santé GPS `/health`.
- Tests automatisés sur les principaux composants du service GPS.

### Corrigé

- Correction du job de tests incompatible avec l’option Node `--no-webstorage`.
- Adaptation des scripts de tests afin de vérifier la disponibilité de l’option avant son utilisation.
- Correction de vulnérabilités npm liées à l’écosystème Socket.IO.
- Mise à jour du lockfile afin d’utiliser une version corrigée de `socket.io-parser`.

### Sécurité

- Audit npm automatisé dans la CI.
- Blocage des vulnérabilités hautes détectées par l’audit GPS.
- Validation du JWT avant l’acceptation des connexions WebSocket.

### Validation

La version GPS est contrôlée par plusieurs étapes :

- `npm ci`
- `npm audit`
- lint
- tests avec couverture
- typecheck TypeScript
- build NestJS

Le correctif relatif à `socket.io-parser` est notamment associé au commit :

`1fdb366 — fix vulnerability job security`

Le correctif relatif à `--no-webstorage` est notamment associé au commit :

`356dc04 — fix job erroro`

### Preuves principales

- `gps-service/package.json`
- `gps-service/package-lock.json`
- `gps-service/src/gps.gateway.ts`
- `gps-service/src/socket-auth.service.ts`
- `gps-service/src/redis-gps.store.ts`
- `gps-service/src/ride-access.service.ts`
- `gps-service/src/*.spec.ts`
- `.github/workflows/ci.yml`

---

## [infra-v1.0.0]

### Ajouté

- Stack Docker Compose de production comprenant :
  - backend ;
  - service GPS ;
  - PostgreSQL ;
  - Redis ;
  - Nginx.
- Reverse proxy Nginx.
- Healthchecks Docker sur les services critiques.
- Workflow GitHub Actions de déploiement vers Scaleway.
- Construction des images Docker backend et GPS.
- Publication des images dans le Scaleway Container Registry.
- Déploiement distant sur l’instance Scaleway par SSH.
- Utilisation du SHA Git comme `IMAGE_TAG`.
- Supervision Uptime Kuma via `docker-compose.monitoring.yml`.
- Intégration de SonarQube Community Build dans la chaîne qualité.

### Corrigé / amélioré

- Correction de problèmes de CI liés aux environnements Node.js.
- Renforcement de la chaîne de déploiement Scaleway.
- Ajout d’informations de diagnostic en cas d’échec d’une tâche SonarQube.
- Récupération du `ceTaskId` SonarQube dans la CI afin de faciliter l’analyse des erreurs.
- Documentation des procédures d’exploitation et de diagnostic.

### Sécurité

- Secrets de déploiement fournis à travers GitHub Secrets.
- Accès au Scaleway Container Registry via les informations d’authentification de la CI.
- Clé SSH du serveur utilisée uniquement dans le contexte du déploiement.
- Audits npm et Python intégrés à la CI.

### Déploiement

Après validation de la CI, le workflow de déploiement :

1. récupère le SHA Git validé ;
2. construit les images Docker backend et GPS ;
3. publie les images dans le Scaleway Container Registry ;
4. utilise le SHA comme `IMAGE_TAG` ;
5. se connecte au serveur Scaleway par SSH ;
6. récupère les nouvelles images ;
7. redémarre la stack Docker Compose ;
8. exécute les migrations Django ;
9. vérifie l’état des services.

Cette utilisation du SHA permet d’identifier précisément la révision du code correspondant à une image déployée.

### Preuves principales

- `docker-compose.prod.yml`
- `docker-compose.monitoring.yml`
- `infra/nginx/nginx.prod.conf`
- `.github/workflows/deploy-scaleway.yml`
- `.github/workflows/ci.yml`
- `sonar-project.properties`
- `DEPLOY_SCALEWAY.md`
- `docs/DEPLOY_SCALEWAY_CI.md`
- `docs/MONITORING.md`
- `docs/SONARQUBE.md`

---

## [mobile-v1.0.0] - 2026-07-19

Cette version correspond au tag historique `mobile-v1.0.0`, positionné sur le commit `ab3d55e`.

### Ajouté

- Application mobile Expo / React Native.
- Pipeline EAS Build.
- Configuration permettant au mobile de communiquer avec l’API FleetPro.
- Principaux écrans passager et chauffeur.
- Authentification et inscription.
- Mode de démonstration.
- Gestion des principales interactions liées aux courses.

### Preuves principales

- `mobile/package.json`
- `mobile/app.json`
- `mobile/eas.json`
- `.github/workflows/eas-build.yml`

---

# [Unreleased] - Mobile

Cette section regroupe les modifications mobiles réalisées après le tag `mobile-v1.0.0` et qui ne doivent donc pas être présentées comme appartenant rétroactivement à cette version.

Elles seront intégrées dans une prochaine version mobile lors de la création d’un nouveau tag.

### Ajouté

- Tests ciblés sur :
  - le client API ;
  - le store d’authentification ;
  - le store de courses ;
  - les données de lieux ;
  - certains utilitaires de formatage.
- Audit de sécurité mobile spécifique.
- Fichier d’allowlist permettant de documenter certaines vulnérabilités transitives.

### Modifié

- Amélioration de plusieurs éléments d’accessibilité.
- Amélioration de la visibilité des placeholders dans les formulaires.
- Évolution de la configuration du mode de démonstration.

### Sécurité

- Ajout de `EXPO_PUBLIC_DEMO_PASSWORD` afin d’éviter de conserver le mot de passe de démonstration directement dans le code.
- Audit npm mobile contrôlé par le script `mobile/scripts/security-audit.js`.
- Allowlist documentée dans `mobile/security-audit.allowlist.json`.
- Les vulnérabilités hautes ou critiques non prévues dans l’allowlist restent bloquantes dans la CI.

### Preuves principales

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/api/client.ts`
- `mobile/src/store/auth.ts`
- `mobile/src/store/rides.ts`
- `mobile/src/**/*.test.ts`
- `mobile/scripts/security-audit.js`
- `mobile/security-audit.allowlist.json`
- `.github/workflows/ci.yml`

---

# Historique significatif

Le tableau suivant ne constitue pas une liste exhaustive de tous les commits du projet. Il regroupe les révisions les plus importantes ayant participé aux versions actuelles de FleetPro ou à leur maintien en condition opérationnelle.

| Date | SHA court | Message | Type | Composants |
| --- | --- | --- | --- | --- |
| 2026-08-17 | `c127d07` | ajout Swagger | Documentation API | Backend |
| 2026-08-14 | `71f61e6` | version node ci | CI | GPS, Mobile, Infra |
| 2026-08-14 | `f6685f8` | allow | Sécurité | Mobile |
| 2026-08-14 | `1fdb366` | fix vulnerability job security | Sécurité | GPS, Mobile |
| 2026-08-14 | `bd2e7ab` | fix erreur npm audit | CI / Sécurité | GPS, Mobile |
| 2026-08-14 | `4776b00` | monitorin on scaelway | Supervision | Infra |
| 2026-07-24 | `2d511d8` | package.json + readme modif | Documentation | Mobile, Infra |
| 2026-07-23 | `372f278` | change simulation data | Fonctionnel | Mobile, Backend |
| 2026-07-23 | `33ba5b2` | placeholder color form | UX / Accessibilité | Mobile |
| 2026-07-23 | `356dc04` | fix job erroro | CI | GPS, Mobile |
| 2026-07-23 | `b834f3b` | add fleet luxe | Fonctionnel | Backend, Mobile |
| 2026-07-22 | `9a8a425` | fix sonar issue | Qualité | Mobile, SonarQube |
| 2026-07-22 | `8fc01f5` | Add EXPO_PUBLIC_DEMO_PASSWORD to environment files and CI workflow | Sécurité | Mobile, CI |
| 2026-07-22 | `5973659` | Enhance accessibility features across mobile components and screens | Accessibilité | Mobile |
| 2026-07-22 | `a705e98` | Add GitHub Actions workflow for deploying to Scaleway | Déploiement | Infra |
| 2026-07-21 | `13132ae` | sonarqube + eslint + ruff ci | Qualité / CI | Backend, GPS, Mobile, Infra |
| 2026-07-21 | `fcd35c2` | simulation course client pour chauffeur | Fonctionnel | Backend, Mobile |
| 2026-07-21 | `7a793c4` | fleether + fleetpmr | Fonctionnel | Backend, Mobile |
| 2026-07-21 | `65989ce` | formulaire inscription | Fonctionnel | Backend, Mobile |
| 2026-07-21 | `9bf9545` | hateoas | API REST | Backend |
| 2026-07-21 | `271687d` | ajout test unit | Tests | Backend, GPS, Mobile |
| 2026-07-20 | `0f524f6` | fix eas build token | CI mobile | Mobile |
| 2026-07-19 | `ab3d55e` | add eas mobile build pipeline and docs | Build mobile | Mobile |
| 2026-07-19 | `51e882a` | add scaleway production deployment stack | Déploiement | Infra |

---

# Règles de gestion des versions

Afin de maintenir un journal cohérent dans les prochaines évolutions de FleetPro, les règles suivantes sont retenues :

- utiliser un tag spécifique au composant concerné ;
- créer une nouvelle version lorsqu’un état stable doit être identifié ;
- ne jamais déplacer un tag déjà publié sans décision explicite ;
- mettre à jour ce `CHANGELOG.md` avant la création d’une nouvelle version ;
- placer dans une section `Unreleased` les modifications réalisées après le dernier tag ;
- ne jamais rattacher rétroactivement une modification à une version antérieure ;
- conserver le SHA Git comme référence technique exacte ;
- ne marquer une version comme « déployée » que si son déploiement peut être démontré ;
- conserver une preuve de déploiement pour les versions serveur importantes ;
- utiliser un tag différent lorsque seul un composant évolue ;
- réserver un éventuel tag global `fleetpro-vX.Y.Z` aux livraisons impliquant l’ensemble du système.

---

# Commandes utiles

## Lister les tags

```bash
git tag --list