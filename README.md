# 📘 xcraft-core-book

## Aperçu

Le module `xcraft-core-book` est une librairie utilitaire du framework Xcraft qui fournit des abstractions pour la gestion de bases de données SQLite et des files d'attente de tâches persistantes. Il constitue le "livre de sorts" (spell book) de Xcraft en offrant des outils de persistance et de traitement asynchrone robustes avec support multi-plateforme.

## Sommaire

- [Structure du module](#structure-du-module)
- [Fonctionnement global](#fonctionnement-global)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Interactions avec d'autres modules](#interactions-avec-dautres-modules)
- [Détails des sources](#détails-des-sources)

## Structure du module

Le module expose deux classes principales :

- **`SQLite`** : Gestionnaire de bases de données SQLite avec support multi-backend
- **`PersistantJobQueue`** : File d'attente de tâches persistante basée sur SQLite

L'architecture modulaire permet de supporter différents backends SQLite selon l'environnement d'exécution (Node.js, Electron, Bun, WASM) avec une API unifiée.

## Fonctionnement global

### Gestion SQLite multi-backend

Le module `SQLite` abstrait l'utilisation de SQLite en supportant automatiquement différents backends :

1. **better-sqlite3** : Backend principal pour Node.js et Electron avec optimisations de cache
2. **node-sqlite3-wasm** : Backend WebAssembly pour les environnements contraints
3. **bun-sqlite** : Backend natif pour l'environnement Bun

Le choix du backend se fait lors de l'instanciation via le paramètre `wasm`. Si `wasm` est `true`, le backend WebAssembly est utilisé, sinon c'est `better-sqlite3` par défaut.

### File d'attente persistante

La classe `PersistantJobQueue` implémente une file d'attente de tâches avec :

- **Persistance** : Les tâches survivent aux redémarrages de l'application
- **Parallélisme contrôlé** : Limitation configurable du nombre de tâches simultanées
- **Gestion d'état** : Suivi des tâches (waiting, running, done)
- **Sécurité thread** : Protection par mutex pour les opérations concurrentes
- **Séquençage** : Traitement des tâches dans l'ordre d'ajout
- **Logging coloré** : Suivi visuel de l'état de la file d'attente

## Exemples d'utilisation

### Utilisation de SQLite

```javascript
const {SQLite} = require('xcraft-core-book');

// Initialisation avec backend automatique (better-sqlite3)
const sqlite = new SQLite('/path/to/db/directory');

// Initialisation avec backend WASM spécifique
const sqliteWasm = new SQLite('/path/to/db/directory', false, true);

// Vérification de disponibilité
if (!sqlite.usable()) {
  console.log('SQLite non disponible sur cette plateforme');
  return;
}

// Ouverture d'une base de données
const tables = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const queries = {
  insertUser: 'INSERT INTO users (name, email) VALUES ($name, $email)',
  getUser: 'SELECT * FROM users WHERE id = $id',
  getAllUsers: 'SELECT * FROM users ORDER BY created_at DESC',
  updateUser: 'UPDATE users SET name = $name WHERE id = $id',
};

const indices = `
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
`;

sqlite.open('myapp', tables, queries, null, null, indices);

// Utilisation des requêtes préparées
const stmts = sqlite.stmts('myapp');
stmts.insertUser.run({name: 'John Doe', email: 'john@example.com'});
const user = stmts.getUser.get({id: 1});

// Gestion des erreurs de verrouillage avec retry automatique
const result = await SQLite.wait(() => {
  return stmts.getUser.get({id: 1});
});
```

### Utilisation de PersistantJobQueue

```javascript
const {PersistantJobQueue} = require('xcraft-core-book');

// Fonction de traitement des tâches
const jobRunner = (job, callback) => {
  console.log(`Processing job ${job.jobId} of topic ${job.topic}`);
  console.log('Job data:', job.work);

  // Simulation d'un traitement asynchrone
  setTimeout(() => {
    if (job.work.shouldFail) {
      console.error(`Job ${job.jobId} failed`);
      // En cas d'erreur, la tâche reste en état "running"
      // Il faudrait implémenter une logique de retry
    } else {
      console.log(`Job ${job.jobId} completed successfully`);
    }
    callback();
  }, Math.random() * 2000);
};

// Création de la file d'attente
const queue = new PersistantJobQueue(
  '/path/to/queue.db', // Chemin de la base de données
  'email-queue', // Nom de la queue
  jobRunner, // Fonction de traitement
  3, // Limite de parallélisme
  true, // Utiliser le logger
  {timeout: 5000} // Options SQLite
);

// Ajout de tâches avec différents topics
await queue.push({
  id: 'email-001',
  topic: 'notifications',
  work: {
    type: 'welcome',
    to: 'user@example.com',
    subject: 'Welcome!',
    body: 'Welcome to our platform',
  },
});

await queue.push({
  id: 'email-002',
  topic: 'marketing',
  work: {
    type: 'newsletter',
    to: 'subscriber@example.com',
    template: 'monthly-newsletter',
    data: {month: 'January', year: 2024},
  },
});

// Contrôle de la file
queue.pause(); // Met en pause le traitement
console.log('Queue paused');

setTimeout(() => {
  queue.resume(); // Reprend le traitement
  console.log('Queue resumed');
}, 5000);
```

## Interactions avec d'autres modules

Le module `xcraft-core-book` interagit avec plusieurs modules de l'écosystème Xcraft :

- **[xcraft-core-fs]** : Utilisé pour la gestion des répertoires de bases de données
- **[xcraft-core-log]** : Système de logging pour le suivi des opérations et debugging
- **[xcraft-core-utils]** : Utilise les primitives de synchronisation (Mutex) pour la thread-safety

Il est couramment utilisé par :

- Les acteurs Goblin et Elf pour la persistance d'état
- Les modules de backend pour le stockage de données structurées
- Les systèmes de traitement asynchrone nécessitant une file d'attente robuste
- Les modules nécessitant une base de données légère et performante

## Détails des sources

### `lib/sqlite.js`

Classe principale pour la gestion des bases de données SQLite avec une architecture multi-backend sophistiquée.

#### Fonctionnalités principales

- **Multi-backend configurable** : Sélection du backend via paramètre (better-sqlite3 ou WASM)
- **Gestion des connexions** : Ouverture, fermeture et réutilisation des connexions avec cache
- **Requêtes préparées** : Préparation et cache des requêtes pour des performances optimales
- **Gestion des erreurs** : Retry automatique pour les erreurs de verrouillage avec backoff
- **Migrations** : Support des callbacks de migration de schéma avec versioning
- **Support des transactions** : Gestion complète des transactions SQLite
- **Fonctions personnalisées** : Possibilité d'enregistrer des fonctions SQL personnalisées

#### Méthodes publiques

- **`open(dbName, tables, queries, onOpen, onMigrate, indices, options)`** — Ouvre une base de données et prépare les requêtes. Crée les tables si nécessaire et exécute les migrations.
- **`close(dbName)`** — Ferme une base de données spécifique et libère les ressources associées.
- **`dispose()`** — Ferme toutes les bases de données ouvertes et libère toutes les ressources.
- **`usable()`** — Vérifie si SQLite est disponible dans l'environnement actuel.
- **`tryToUse()`** — Tente d'utiliser SQLite et affiche un message d'erreur si indisponible.
- **`setEnable(enabled)`** — Active ou désactive SQLite dynamiquement avec fermeture des connexions.
- **`getHandle(dbName)`** — Retourne une fonction pour accéder directement à l'instance de base de données.
- **`stmts(dbName)`** — Retourne les requêtes préparées pour une base de données.
- **`getAllNames()`** — Retourne la liste des noms de toutes les bases ouvertes.
- **`getLocation()`** — Retourne le répertoire de stockage des bases de données.
- **`exec(dbName, query)`** — Exécute une requête SQL directe sans préparation.
- **`prepare(dbName, sql)`** — Prépare une nouvelle requête SQL dynamiquement.
- **`function(dbName, funcName, func)`** — Enregistre une fonction personnalisée dans la base.
- **`pragma(dbName, pragma)`** — Exécute une directive pragma SQLite.
- **`timestamp()`** — Retourne un timestamp ISO 8601 pour les enregistrements.
- **`inTransaction(dbName)`** — Vérifie si une transaction est en cours sur la base.
- **`wait(handler)`** — Méthode statique pour retry automatique en cas de verrouillage de base avec timeout configurable.

### `lib/persistant-job-queue.js`

Implémentation d'une file d'attente de tâches persistante avec gestion avancée du parallélisme et monitoring.

#### Fonctionnalités principales

- **Persistance SQLite** : Stockage des tâches dans une base SQLite avec schéma optimisé
- **Contrôle de parallélisme** : Limitation configurable du nombre de tâches simultanées
- **États des tâches** : Suivi précis des états (waiting, running, done) avec transitions atomiques
- **Pause/Reprise** : Contrôle fin du traitement de la file d'attente
- **Thread-safety** : Protection par mutex des opérations critiques avec gigawatts
- **Logging coloré** : Affichage du statut avec couleurs pour le debugging et monitoring
- **Séquençage automatique** : Attribution automatique de numéros de séquence pour l'ordre FIFO
- **Gestion des topics** : Support des topics pour catégoriser les tâches
- **Monitoring en temps réel** : Compteurs de tâches en attente et en cours d'exécution

#### Méthodes publiques

- **`push(job)`** — Ajoute une nouvelle tâche à la file d'attente. La tâche doit contenir un `id` unique et optionnellement un `topic` et des données `work`.
- **`run()`** — Démarre le traitement des tâches en attente dans la limite du parallélisme configuré avec gestion automatique de la récursion.
- **`pause()`** — Met en pause le traitement de nouvelles tâches sans interrompre les tâches en cours.
- **`resume()`** — Reprend le traitement des tâches après une pause avec redémarrage automatique.

### Fichiers backends

#### `lib/backends/better-sqlite3.js`

Wrapper optimisé pour le backend `better-sqlite3` avec gestion avancée des binaires :

- **Cache des binaires** : Utilisation de binaires pré-compilés pour Electron et Node.js depuis `.cache`
- **Gestion des chemins** : Résolution automatique des binaires selon l'environnement d'exécution
- **Détection d'environnement** : Distinction automatique entre Node.js et Electron avec `process.versions.electron`
- **Optimisations** : Chargement de binaires optimisés depuis le cache pour éviter la recompilation
- **Support natif** : Utilisation de `nativeBinding` pour charger les binaires pré-compilés

#### `lib/backends/node-sqlite3-wasm.js`

Adapter sophistiqué pour le backend WebAssembly avec normalisation complète de l'API :

- **Compatibilité API** : Harmonisation complète avec l'API better-sqlite3 pour la portabilité
- **Gestion des paramètres** : Normalisation avancée des paramètres nommés (\$param) et positionnels
- **Support des transactions** : Implémentation des transactions manuelles avec BEGIN/COMMIT
- **Mode raw** : Support du mode raw pour les résultats sous forme de tableaux
- **Binding de paramètres** : Système de binding avancé pour la réutilisation de requêtes avec cache
- **Reset automatique** : Nettoyage automatique des statements après exécution pour éviter les fuites
- **Gestion des itérateurs** : Support complet des itérateurs avec yield et cleanup automatique

#### `lib/backends/bun-sqlite.js`

Adapter léger pour l'environnement Bun avec les spécificités du runtime :

- **API native Bun** : Utilisation du module SQLite intégré à Bun (`bun:sqlite`)
- **Limitations documentées** : Certaines fonctionnalités comme `function()` ne sont pas supportées
- **Pragma optimisé** : Implémentation spécifique pour les directives pragma avec parsing automatique
- **Finalisation propre** : Gestion propre de la finalisation des statements pour éviter les fuites mémoire
- **Mode simple** : Support du mode simple pour les pragma avec extraction automatique des valeurs

---

_Documentation mise à jour automatiquement._

[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-log]: https://github.com/Xcraft-Inc/xcraft-core-log
[xcraft-core-utils]: https://github.com/Xcraft-Inc/xcraft-core-utils