# 📘 xcraft-core-book

## Aperçu

Le module `xcraft-core-book` est une librairie utilitaire du framework Xcraft qui fournit des abstractions pour la gestion de bases de données SQLite et des files d'attente de tâches persistantes. Il constitue le "livre de sorts" (spell book) de Xcraft en offrant des outils de persistance et de traitement asynchrone robustes avec support multi-plateforme (Node.js, Electron, Bun, WASM).

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

L'architecture modulaire permet de supporter différents backends SQLite selon l'environnement d'exécution avec une API unifiée. Les backends disponibles sont `better-sqlite3`, `node-sqlite3-wasm` et `bun-sqlite`.

## Fonctionnement global

### Gestion SQLite multi-backend

La classe `SQLite` abstrait l'accès à SQLite en déléguant à l'un des backends disponibles selon le contexte d'exécution :

1. **better-sqlite3** (défaut) : Backend principal pour Node.js et Electron avec optimisations de binaires pré-compilés depuis le cache.
2. **node-sqlite3-wasm** : Backend WebAssembly pour les environnements où les binaires natifs ne sont pas disponibles.
3. **bun-sqlite** : Backend natif pour l'environnement Bun, non sélectionnable via le constructeur de `SQLite` (utilisé directement).

Le choix du backend s'effectue à l'instanciation via le paramètre `wasm`. Si `wasm` vaut `true`, le backend WASM est chargé ; sinon `better-sqlite3` est utilisé par défaut. Le fichier `bun-sqlite.js` est destiné à un usage direct dans un environnement Bun.

### File d'attente persistante

La classe `PersistantJobQueue` implémente une file d'attente FIFO avec :

- **Persistance** : Les tâches sont stockées dans SQLite et survivent aux redémarrages.
- **Parallélisme contrôlé** : Nombre de tâches simultanées configurable via `parallelLimit`.
- **Gestion d'état** : Chaque tâche transite par les états `waiting` → `running` → supprimée à la fin.
- **Thread-safety** : Les insertions sont protégées par un mutex ([gigawatts]).
- **Séquençage FIFO** : Les tâches sont traitées dans l'ordre d'insertion via un numéro de séquence.
- **Logging coloré** : Affichage du nombre de tâches en attente et en cours via [xcraft-core-log].

## Exemples d'utilisation

### Utilisation de SQLite

```javascript
const {SQLite} = require('xcraft-core-book');

// Instanciation avec le backend par défaut (better-sqlite3)
const sqlite = new SQLite('/path/to/db/directory');

// Instanciation avec le backend WASM
const sqliteWasm = new SQLite('/path/to/db/directory', false, true);

if (!sqlite.usable()) {
  console.log('SQLite non disponible sur cette plateforme');
  return;
}

// Ouverture d'une base de données avec tables, requêtes préparées et indices
const tables = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  );
`;

const queries = {
  insertUser: 'INSERT INTO users (name, email) VALUES ($name, $email)',
  getUser: 'SELECT * FROM users WHERE id = $id',
};

const indices = `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`;

sqlite.open('myapp', tables, queries, null, null, indices);

// Utilisation des requêtes préparées
const stmts = sqlite.stmts('myapp');
stmts.insertUser.run({name: 'John Doe', email: 'john@example.com'});
const user = stmts.getUser.get({id: 1});

// Retry automatique en cas de verrouillage
const result = await SQLite.wait(() => stmts.getUser.get({id: 1}));
```

### Utilisation de PersistantJobQueue

```javascript
const {PersistantJobQueue} = require('xcraft-core-book');

const jobRunner = (job, callback) => {
  console.log(`Traitement du job ${job.jobId}`, job.work);
  setTimeout(() => {
    console.log(`Job ${job.jobId} terminé`);
    callback();
  }, 500);
};

const queue = new PersistantJobQueue(
  '/path/to/queue.db', // Chemin de la base SQLite
  'email-queue', // Nom de la queue
  jobRunner, // Fonction de traitement
  3, // Limite de parallélisme
  true, // Activer le logger
  {timeout: 5000} // Options SQLite
);

// Ajout de tâches
await queue.push({
  id: 'email-001',
  topic: 'notifications',
  work: {to: 'user@example.com', subject: 'Bienvenue'},
});

// Contrôle du flux
queue.pause();
setTimeout(() => queue.resume(), 5000);
```

## Interactions avec d'autres modules

- **[xcraft-core-fs]** : Utilisé pour créer les répertoires de stockage des bases de données.
- **[xcraft-core-log]** : Système de logging pour le suivi des opérations dans `PersistantJobQueue`.
- **[xcraft-core-utils]** : Fournit le `Mutex` utilisé pour la protection des insertions concurrentes.

Ce module est couramment utilisé par les acteurs Goblin et Elf pour la persistance d'état, ainsi que par les modules de backend nécessitant un stockage structuré léger.

## Détails des sources

### `lib/sqlite.js`

Classe principale d'accès à SQLite. Elle gère le cycle de vie des connexions (ouverture, fermeture, dispose), la préparation et le cache des requêtes SQL, et fournit des utilitaires pour les migrations, les pragma et les fonctions SQL personnalisées.

À l'instanciation, le backend est chargé dynamiquement selon le paramètre `wasm`. Le backend est résolu depuis `./backends/better-sqlite3.js` ou `./backends/node-sqlite3-wasm.js`. En cas d'échec du chargement (plateforme non supportée), `this.Database` reste `null` et `usable()` retourne `false`.

La méthode statique `wait` implémente un mécanisme de retry avec attente de 400 ms pour les erreurs `SQLITE_BUSY`, `SQLITE_LOCKED` et les messages équivalents de better-sqlite3, couvrant notamment le cas documenté dans [better-sqlite3#203].

#### Méthodes publiques

- **`open(dbName, tables, queries, onOpen, onMigrate, indices, options)`** — Ouvre (ou crée) une base de données. Exécute `tables` pour créer le schéma, le callback `onOpen` juste après l'ouverture, `onMigrate` pour les migrations, puis `indices` pour les index. Prépare enfin toutes les requêtes de l'objet `queries`. Retourne `false` si SQLite est indisponible.
- **`close(dbName)`** — Ferme la connexion à la base spécifiée et libère la référence interne.
- **`dispose()`** — Ferme toutes les bases ouvertes en gérant les erreurs individuellement.
- **`usable()`** — Retourne `true` si le backend SQLite a été chargé avec succès.
- **`tryToUse()`** — Appelle `_onError` et retourne `false` si SQLite est indisponible, `true` sinon.
- **`setEnable(enabled)`** — Active ou désactive SQLite dynamiquement ; si désactivé, ferme toutes les connexions ouvertes.
- **`getHandle(dbName)`** — Retourne une fonction `() => db` donnant accès direct à l'instance de base, ou `null` si SQLite est indisponible.
- **`stmts(dbName)`** — Retourne l'objet contenant toutes les requêtes préparées pour la base donnée.
- **`getAllNames()`** — Retourne un tableau des noms de toutes les bases actuellement ouvertes.
- **`getLocation()`** — Retourne le chemin du répertoire de stockage configuré à l'instanciation.
- **`exec(dbName, query)`** — Exécute une requête SQL brute (sans préparation) sur la base spécifiée.
- **`prepare(dbName, sql)`** — Prépare dynamiquement une nouvelle requête SQL et retourne le statement.
- **`function(dbName, funcName, func)`** — Enregistre une fonction JavaScript appelable depuis les requêtes SQL.
- **`pragma(dbName, pragma)`** — Exécute une directive pragma et retourne le résultat en mode `simple`.
- **`timestamp()`** — Retourne la date/heure courante au format ISO 8601.
- **`inTransaction(dbName)`** — Retourne `true` si une transaction est actuellement active sur la base.
- **`SQLite.wait(handler)`** _(statique)_ — Exécute `handler` avec retry automatique (400 ms de délai) en cas d'erreur de verrouillage SQLite. Propage toute autre erreur immédiatement.

### `lib/persistant-job-queue.js`

Implémentation d'une file d'attente persistante basée sur une table SQLite `JobQueue` (colonnes : `jobId`, `topic`, `seq`, `status`, `work`). Le constructeur crée la table si elle n'existe pas, prépare toutes les requêtes et compte les tâches en attente au démarrage pour reprendre là où le processus s'était arrêté.

Lorsqu'une tâche est dépilée par `run()`, son statut passe à `running` et le runner est appelé via `setImmediate`. Une fois le callback du runner invoqué, la tâche est supprimée de la base et `run()` est rappelée récursivement pour traiter la suivante. Les insertions sont sérialisées par un `Mutex` ([gigawatts]) pour éviter les conflits en cas d'appels concurrents à `push`.

#### Méthodes publiques

- **`push(job)`** — Insère une tâche dans la file avec verrouillage mutex. `job` doit contenir `id` (identifiant unique), et peut contenir `topic` (catégorie, défaut : nom de la queue) et `work` (données sérialisées en JSON). Déclenche automatiquement `run()` après l'insertion.
- **`run()`** — Traite les tâches en attente dans la limite du parallélisme. Sans effet si la queue est en pause, vide ou si la limite est atteinte.
- **`pause()`** — Suspend le démarrage de nouvelles tâches sans interrompre celles en cours.
- **`resume()`** — Lève la pause et relance immédiatement `run()`.

### Fichiers backends

#### `lib/backends/better-sqlite3.js`

Sous-classe de `better-sqlite3` qui résout automatiquement le binaire natif pré-compilé depuis `.cache/better-sqlite3` (chemin relatif à `node_modules`). Distingue les environnements Electron (`process.versions.electron`) et Node.js pour charger le binaire approprié (`electron_better_sqlite3.node` ou `node_better_sqlite3.node`). Si aucun binaire en cache n'est trouvé, `better-sqlite3` utilise son binaire embarqué standard.

#### `lib/backends/node-sqlite3-wasm.js`

Adapter complet qui harmonise l'API de `node-sqlite3-wasm` avec celle de `better-sqlite3`. Les différences couvertes incluent la normalisation des paramètres nommés (ajout du préfixe `$` manquant, conversion des `undefined` en `null`), le support du mode `raw` (résultats sous forme de tableaux de valeurs), l'implémentation du binding de paramètres avec mémorisation, le reset automatique des statements après chaque exécution, l'adaptation des itérateurs avec nettoyage, et les transactions manuelles via `BEGIN/COMMIT`. Les méthodes `backup()` et `unsafeMode()` sont des no-ops pour la compatibilité d'interface.

#### `lib/backends/bun-sqlite.js`

Adapter minimal pour `bun:sqlite` (module natif de Bun). Ajoute une implémentation de `pragma()` compatible avec l'API better-sqlite3 (mode `simple` avec parsing du nom de directive). La méthode `function()` lève une erreur explicite car non supportée par Bun. Les statements sont finalisés proprement après usage.

## Licence

Ce module est distribué sous [licence MIT](./LICENSE).

[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-log]: https://github.com/Xcraft-Inc/xcraft-core-log
[xcraft-core-utils]: https://github.com/Xcraft-Inc/xcraft-core-utils
[gigawatts]: https://github.com/Xcraft-Inc/gigawatts
[better-sqlite3#203]: https://github.com/WiseLibs/better-sqlite3/issues/203

---

_Ce contenu a été généré par IA_
