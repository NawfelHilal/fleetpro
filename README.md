# FleetPro

FleetPro est une plateforme VTC éthique et cloud-native développée dans le cadre d’un projet de fin d’année Master.
Le projet couvre un parcours complet passager/chauffeur : inscription, connexion, demande de course, matching chauffeur, suivi GPS temps réel, paiement, simulation de course et déploiement cloud.

## Objectifs du projet

- Proposer une alternative VTC avec une commission fixe de `15 %`.
- Séparer le backend métier du service GPS temps réel.
- Fournir une application mobile Expo utilisable en mode passager ou chauffeur.
- Intégrer une qualité de code vérifiable : tests, couverture, lint, audits de sécurité et SonarQube.
- Préparer une infrastructure exploitable localement avec Docker Compose et déployable sur Scaleway.

## Utilisation actuelle recommandée

La version de démonstration actuelle est déjà déployée sur le serveur Scaleway. Le backend Django, le service GPS NestJS, PostgreSQL, Redis et Nginx tournent donc côté serveur.

Pour tester l’application sur smartphone, il n’est pas nécessaire de lancer toute la stack en local. Le mode recommandé consiste uniquement à lancer l’application mobile Expo depuis le PC, puis à scanner le QR code avec Expo Go. Le mobile communique directement avec l’API et le service GPS hébergés sur Scaleway.

Pour que le téléphone puisse se connecter au serveur Metro d’Expo lancé sur le PC, il faut renseigner l’IPv4 locale du PC dans `REACT_NATIVE_PACKAGER_HOSTNAME`. Cette adresse se récupère avec la commande `ipconfig` sous Windows.

Docker Compose local reste disponible pour le développement complet ou pour travailler hors serveur, mais il n’est pas obligatoire pour une recette mobile classique.

## Fonctionnalités principales

### Passager

- Création de compte passager.
- Connexion avec JWT.
- Choix d’une destination avec autocomplétion d’adresse en France, avec destinations de démonstration en fallback.
- Choix du service :
  - `Fleet Standard` : course classique.
  - `FleetHer` : course proposée uniquement aux chauffeurs femmes éligibles.
  - `Fleet PMR` : course proposée uniquement aux chauffeurs avec véhicule adapté PMR.
  - `FleetLuxe` : course premium.
- Estimation du prix côté backend.
- Paiement Stripe en mode test ou paiement simulé en mode démo.
- Suivi de la course et simulation des étapes avec tracé routier OSRM lorsque le service d’itinéraire est disponible.

### Chauffeur

- Création de compte chauffeur.
- Formulaire professionnel :
  - permis,
  - carte professionnelle VTC,
  - entreprise/statut,
  - SIRET,
  - assurance professionnelle,
  - genre pour l’éligibilité FleetHer,
  - véhicule,
  - adaptation PMR.
- Passage en ligne avec publication GPS via Socket.io.
- Réception des demandes proches.
- Bouton de démonstration pour générer une demande passager proche du chauffeur.
- Acceptation, démarrage et clôture de course.

### Backend et infrastructure

- API REST Django REST Framework.
- Authentification JWT avec refresh token.
- HATEOAS partiel via `_links` sur les ressources clés.
- PostgreSQL pour les données persistantes.
- Redis pour les positions GPS temporaires.
- NestJS + Socket.io pour le GPS temps réel.
- Nginx comme API Gateway.
- Docker Compose local et production.
- CI GitHub Actions avec tests, coverage, lint, audits sécurité et SonarQube Community Build.

## Architecture

```txt
Mobile Expo
  | HTTP / WebSocket
  v
Nginx API Gateway
  | REST                       | Socket.io
  v                            v
Django REST API                NestJS GPS Service
  | SQL                        | Redis GEO + TTL
  v                            v
PostgreSQL                     Redis
```

Rôles des blocs :

- `backend/` : API métier Django, comptes, chauffeurs, véhicules, courses, paiements, notifications.
- `gps-service/` : service NestJS Socket.io pour les positions chauffeurs et le matching proche.
- `mobile/` : application Expo React Native TypeScript.
- `infra/nginx/` : reverse proxy local et production.
- `deploy/` et `DEPLOY_SCALEWAY.md` : scripts et documentation de déploiement Scaleway.
- `docs/` : documentation technique, API, qualité, accessibilité, SonarQube et dossier Bloc 2.

## Prérequis

- Pour tester uniquement l’application mobile avec Scaleway :
  - Node.js compatible avec le projet mobile.
  - Expo Go sur téléphone.
  - Un terminal PowerShell sous Windows.
- Pour lancer toute la stack en local :
  - Docker Desktop lancé.
  - Python 3.12 si lancement backend hors Docker.

## Tester l’application mobile avec Scaleway

C’est le mode recommandé actuellement. Le backend, le service GPS, PostgreSQL, Redis et Nginx sont déjà disponibles sur le serveur Scaleway. Il faut donc lancer uniquement l’application mobile Expo sur le PC.

Dans ce mode, le PC sert seulement à démarrer Expo. Le téléphone appelle directement les services hébergés sur Scaleway.

Architecture de test :

```txt
iPhone / Expo Go
  |
  | HTTP / WebSocket
  v
Serveur Scaleway
  |
  | Nginx -> Backend Django / GPS NestJS / Redis / PostgreSQL
```

Créer le fichier d’environnement mobile depuis l’exemple :

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Variables présentes dans `mobile/.env` :

```env
EXPO_PUBLIC_API_URL=http://51.158.102.141/api/v1
EXPO_PUBLIC_GPS_URL=http://51.158.102.141
EXPO_PUBLIC_GEOCODING_URL=https://nominatim.openstreetmap.org/search
EXPO_PUBLIC_OSRM_URL=https://router.project-osrm.org/route/v1/driving
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.20
EXPO_PUBLIC_USE_SIMULATED_PAYMENT=true
EXPO_PUBLIC_ENABLE_DEMO_SIMULATION=true
EXPO_PUBLIC_DEMO_PASSWORD=password123
```

Remplacer `192.168.1.20` par l’IPv4 locale du PC qui lance Expo.

Pour trouver l’IPv4 locale sous Windows :

```powershell
ipconfig
```

Utiliser la valeur `Adresse IPv4` de la carte Wi-Fi ou Ethernet connectée au même réseau que le téléphone.

Lancer ensuite uniquement Expo :

```powershell
cd mobile
npm install
npx expo start --lan --clear
```

Si le QR code LAN ne fonctionne pas sur le téléphone :

```powershell
npx expo start --tunnel --clear
```

Dans ce mode, ne pas lancer localement :

- `backend`,
- `gps-service`,
- `postgres`,
- `redis`,
- `nginx`.

Avant de tester le mobile, vérifier que Scaleway répond :

```powershell
Invoke-WebRequest http://51.158.102.141/health
Invoke-WebRequest http://51.158.102.141/api/v1/health/
```

Documentation API interactive :

- Swagger UI : `http://51.158.102.141/api/docs/`
- Redoc : `http://51.158.102.141/api/redoc/`
- Schéma OpenAPI : `http://51.158.102.141/api/schema/`

Après chaque modification de `mobile/.env`, relancer Expo avec `--clear` pour éviter que Metro garde d’anciennes variables.

Comptes de démonstration disponibles sur Scaleway :

- Passager : `passenger` / `password123`
- Chauffeur : `driver` / `password123`

## Installation locale avec Docker

Cette section est utile pour développer ou tester toute l’infrastructure sur le PC. Elle n’est pas nécessaire si les services backend, GPS, PostgreSQL, Redis et Nginx sont déjà actifs sur Scaleway.

Depuis la racine du projet :

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Docker démarre :

- PostgreSQL,
- Redis,
- backend Django,
- GPS NestJS,
- Nginx,
- Expo mobile.

Endpoints locaux :

- API Gateway : `http://localhost:8090`
- API REST : `http://localhost:8090/api/v1`
- WebSocket GPS : `http://localhost:8090/socket.io`
- Backend direct : `http://localhost:8000`
- GPS direct : `http://localhost:3001`
- Expo Metro : `http://localhost:8081`

Pour arrêter :

```powershell
docker compose down
```

Pour relancer proprement :

```powershell
docker compose up --build
```

## Initialisation des données

Cette section concerne uniquement le lancement local complet avec Docker. Pour le serveur Scaleway de démonstration, les données nécessaires sont déjà initialisées.

En local, le backend exécute automatiquement les migrations et le seed démo au démarrage Docker.

Commandes manuelles utiles :

```powershell
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo
docker compose exec backend python manage.py createsuperuser
```

Comptes de démonstration :

- Passager : `passenger` / `password123`
- Chauffeur : `driver` / `password123`

Le mot de passe démo peut être affiché côté mobile avec :

```env
EXPO_PUBLIC_DEMO_PASSWORD=password123
```

## Tester toute la stack locale sur téléphone avec Expo Go

Expo Go ne peut pas appeler correctement `localhost` depuis un téléphone. Il faut utiliser l’IP Wi-Fi du PC.

1. Trouver l’IPv4 du PC :

```powershell
ipconfig
```

2. Modifier `.env` avec l’IP Wi-Fi, par exemple :

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:8090/api/v1
EXPO_PUBLIC_GPS_URL=http://192.168.1.20:8090
EXPO_PUBLIC_GEOCODING_URL=https://nominatim.openstreetmap.org/search
EXPO_PUBLIC_OSRM_URL=https://router.project-osrm.org/route/v1/driving
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.20
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend,192.168.1.20
```

3. Relancer le mobile :

```powershell
docker compose up --build mobile
```

Alternative hors Docker :

```powershell
cd mobile
npm install
npx expo start --lan --clear
```

Puis scanner le QR code avec Expo Go.

## Mode démo

Le mode démo permet de tester le projet sans paiement réel et sans vrai chauffeur dans la rue.

Variables importantes :

```env
ENABLE_DEMO_SIMULATION=true
EXPO_PUBLIC_ENABLE_DEMO_SIMULATION=true
EXPO_PUBLIC_USE_SIMULATED_PAYMENT=true
```

Scénario conseillé :

1. Se connecter en chauffeur avec `driver`.
2. Passer le chauffeur en ligne.
3. Cliquer sur `Simuler une demande client proche`.
4. Aller dans l’onglet `Courses`.
5. Accepter la demande.
6. Ouvrir le suivi de course.

Le scénario de démonstration est centré sur Nice :

- récupération : `Hôtel Negresco`,
- destination : `Aéroport Nice Côte d’Azur`,
- chauffeur simulé proche du Negresco.

## Paiement Stripe

Deux modes existent :

- Paiement simulé pour la démonstration locale.
- Stripe test/réel via PaymentIntent.

Variables Stripe :

```env
STRIPE_SECRET_KEY=sk_test_change_me
STRIPE_WEBHOOK_SECRET=whsec_change_me
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_change_me
EXPO_PUBLIC_USE_SIMULATED_PAYMENT=false
```

Le webhook Stripe cible :

```txt
/api/v1/payments/webhook/
```

Le mobile ne manipule jamais la clé secrète Stripe.

## Notifications push

Le backend contient une abstraction de notification compatible Firebase Cloud Messaging.

Variable :

```env
FIREBASE_CREDENTIALS_PATH=
```

Les notifications natives nécessitent un development build Expo avec configuration Firebase/APNs. Expo Go suffit pour tester le reste du projet, mais pas les notifications push natives complètes.

## Commandes de qualité

### Backend

```powershell
cd backend
..\.venv\Scripts\python.exe -m ruff check .
..\.venv\Scripts\python.exe -m bandit -r apps -x "*/migrations/*" --severity-level medium
..\.venv\Scripts\python.exe -m pip_audit -r requirements.txt --strict
```

Avec Docker :

```powershell
docker compose exec backend python manage.py test tests
```

### GPS service

```powershell
cd gps-service
npm run lint
npm run typecheck
npm run test:coverage
npm run security:audit
```

### Mobile

```powershell
cd mobile
npm run lint
npm run typecheck
npm run test:coverage
npm run security:audit
```

## CI/CD

La CI GitHub Actions vérifie :

- backend Django :
  - Ruff,
  - Bandit,
  - pip-audit,
  - tests,
  - coverage minimum,
  - migrations Django.
- GPS NestJS :
  - npm audit,
  - lint,
  - tests avec coverage,
  - typecheck,
  - build.
- Mobile Expo :
  - npm audit,
  - lint,
  - tests avec coverage,
  - typecheck.
- SonarQube Community Build :
  - analyse qualité,
  - bugs,
  - maintenabilité,
  - couverture,
  - Quality Gate.

Le workflow de build EAS permet de lancer un build mobile Expo depuis GitHub Actions avec un `EXPO_TOKEN`.

## Déploiement Scaleway

Le projet peut être déployé sur une instance Scaleway avec Docker Compose production.

Documentation dédiée :

- `DEPLOY_SCALEWAY.md`
- `docs/DEPLOY_SCALEWAY_CI.md`
- `deploy/README_SCALEWAY_UPLOAD.md`

Fichier de production :

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Après déploiement ou changement de modèle Django :

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend python manage.py migrate
```

Vérification santé :

```powershell
Invoke-WebRequest http://51.158.102.141/health
Invoke-WebRequest http://51.158.102.141/api/v1/health/
```

Remplacer l’IP par l’adresse réelle du serveur ou par le domaine configuré.

## Supervision avec Uptime Kuma

FleetPro intègre une supervision légère avec Uptime Kuma pour le Bloc 4. Cette supervision contrôle la disponibilité des endpoints publics et permet de déclencher une alerte en cas d’indisponibilité.

Démarrer Uptime Kuma sur Scaleway :

```bash
cd /opt/fleetpro
docker compose --env-file .env.prod -f docker-compose.monitoring.yml up -d
```

Accéder à l’interface :

```txt
http://51.158.102.141:3002
```

Moniteurs conseillés :

- `FleetPro Gateway` : `http://51.158.102.141/health`
- `FleetPro API` : `http://51.158.102.141/api/v1/health/`
- `FleetPro GPS` : `http://51.158.102.141/socket.io/?EIO=4&transport=polling`

Prometheus et Grafana sont prévus comme évolution lorsque le besoin de métriques détaillées augmentera.

Documentation complète : `docs/MONITORING.md`.

## Variables d’environnement principales

Les exemples ont été volontairement simplifiés :

- `.env.example` sert uniquement au lancement complet en local avec Docker.
- `.env.prod.example` sert uniquement aux conteneurs du serveur Scaleway.
- `mobile/.env.example` sert au test actuel avec Expo Go et le backend déjà hébergé sur Scaleway.

### Backend

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_SECURE_SSL_REDIRECT`
- `DJANGO_ALLOWED_HOSTS`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `JWT_SIGNING_KEY`
- `REDIS_URL`
- `ENABLE_DEMO_SIMULATION`

### GPS

- `GPS_JWT_SECRET`
- `REDIS_URL`
- `CORE_API_URL`

### Mobile

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GPS_URL`
- `EXPO_PUBLIC_GEOCODING_URL`
- `EXPO_PUBLIC_OSRM_URL`
- `EXPO_PUBLIC_USE_SIMULATED_PAYMENT`
- `EXPO_PUBLIC_ENABLE_DEMO_SIMULATION`
- `EXPO_PUBLIC_DEMO_PASSWORD`
- `REACT_NATIVE_PACKAGER_HOSTNAME`

Variables optionnelles non nécessaires au mode démo actuel :

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `FIREBASE_CREDENTIALS_PATH`
- `GPS_MATCH_RADIUS_KM`

Les fichiers `.env`, `.env.prod` et `mobile/.env` ne doivent pas être commités avec de vrais secrets.

## Documentation complémentaire

- Architecture : `docs/ARCHITECTURE.md`
- API REST et Socket.io : `docs/API.md`
- Accessibilité : `docs/ACCESSIBILITY.md`
- Qualité de code : `docs/CODE_QUALITY.md`
- SonarQube : `docs/SONARQUBE.md`
- Supervision : `docs/MONITORING.md`
- Dépannage : `docs/TROUBLESHOOTING.md`
- Déploiement Scaleway : `DEPLOY_SCALEWAY.md`

## Dépannage rapide

### Docker Desktop non lancé

Erreur typique :

```txt
Cannot connect to the Docker daemon
```

Solution : lancer Docker Desktop puis relancer :

```powershell
docker compose up --build
```

### Port déjà utilisé

Erreur typique :

```txt
ports are not available
```

Solution : arrêter l’ancien service ou changer le port dans `docker-compose.yml`.

### Expo Go ne se connecte pas

Utiliser l’IP Wi-Fi du PC au lieu de `localhost` dans `.env`, puis relancer Expo.

### Erreur HTTP 401

Vérifier :

- que l’utilisateur existe,
- que le mot de passe est correct,
- que `JWT_SIGNING_KEY` et `GPS_JWT_SECRET` sont cohérents,
- que le mobile pointe vers le bon `EXPO_PUBLIC_API_URL`.

### Simulation chauffeur impossible

Vérifier :

```env
ENABLE_DEMO_SIMULATION=true
EXPO_PUBLIC_ENABLE_DEMO_SIMULATION=true
```

Puis redémarrer backend et mobile.

## Licence

Projet académique réalisé dans le cadre d’un parcours Master Expert en développement logiciel.
