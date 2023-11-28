'use strict';

const path = require('path');
const xFs = require('xcraft-core-fs');

class SQLite {
  constructor(location, skip) {
    this._stmts = {};
    this._db = {};
    this._dir = location;
    SQLite.prototype._init.call(this, skip);
  }

  _init(skip) {
    try {
      this.Database = skip ? null : require('better-sqlite3');
    } catch (ex) {
      /* ... */
    }
  }

  _path(dbName) {
    return path.join(this._dir, `${dbName}.db`);
  }

  _onError(resp) {
    resp.log.info('sqlite3 is not supported on this platform');
  }

  _prepare(dbName, query, sql) {
    this._stmts[dbName][query] = this._db[dbName].prepare(sql);
  }

  stmts(dbName) {
    return this._stmts[dbName];
  }

  getLocation() {
    return this._dir;
  }

  setEnable(en) {
    SQLite.prototype._init.call(this, !en);

    if (!en) {
      Object.keys(this._db).forEach((db) => this.close(db));
    }
  }

  /**
   * Check if SQLite is usable.
   *
   * @returns {boolean} true if SQLite is available.
   */
  usable() {
    return !!this.Database;
  }

  /**
   *
   * @param {object} resp - Response object provided by busClient.
   * @returns {boolean} true if usable.
   */
  tryToUse(resp) {
    if (!this.usable()) {
      SQLite.prototype._onError.call(this, resp);
      return false;
    }
    return true;
  }

  timestamp() {
    return new Date().toISOString();
  }

  /**
   * Open (and create if necessary) a SQLite database.
   *
   * @param {string} dbName - Database name used for the database file.
   * @param {string} tables - Main queries for creating the tables.
   * @param {object} queries - Raw queries to prepare.
   * @param {Function} onOpen - Callback just after opening the database.
   * @param {Function} onMigrate - Callback for migrations.
   * @param {string} [indices] - Main indices.
   * @param {object} [options]
   * @returns {boolean} false if SQLite is not available.
   */
  open(dbName, tables, queries, onOpen, onMigrate, indices, options) {
    if (!this.usable()) {
      return false;
    }

    if (this._db[dbName]) {
      return true;
    }

    xFs.mkdir(this._dir);

    const dbPath = this._path(dbName);
    options = {...options, timeout: 200};

    /* See xcraft-dev-sqlite node module */
    const cacheDir = path.join(
      __dirname,
      '../../../node_modules/.cache/better-sqlite3'
    );

    if (process.versions.electron) {
      /* Try to load the cached electron version of better-sqlite3 */
      const betterSqlite = path.join(cacheDir, 'electron_better_sqlite3.node');
      if (xFs.fse.existsSync(betterSqlite)) {
        options.nativeBinding = betterSqlite;
      }
    } else {
      /* Try to load the cached node version of better-sqlite3 */
      const betterSqlite = path.join(cacheDir, 'node_better_sqlite3.node');
      if (xFs.fse.existsSync(betterSqlite)) {
        options.nativeBinding = betterSqlite;
      }
    }

    this._db[dbName] = new this.Database(dbPath, options);
    this._stmts[dbName] = {};

    if (onOpen) {
      onOpen();
    }

    this._db[dbName].exec(tables);

    if (onMigrate) {
      onMigrate();
    }

    if (indices) {
      this._db[dbName].exec(indices);
    }

    for (const query in queries) {
      SQLite.prototype._prepare.call(this, dbName, query, queries[query]);
    }

    return true;
  }

  close(dbName) {
    if (!this._db[dbName]) {
      return;
    }
    this._db[dbName].close();
    delete this._db[dbName];
  }

  exec(dbName, query) {
    if (!this.usable() || !this._db[dbName]) {
      return false;
    }
    this._db[dbName].exec(query);
  }

  prepare(dbName, sql) {
    return this._db[dbName].prepare(sql);
  }

  function(dbName, funcName, func) {
    this._db[dbName].function(funcName, func);
  }

  pragma(dbName, pragma) {
    if (!this.usable() || !this._db[dbName]) {
      return false;
    }
    return this._db[dbName].pragma(pragma, {simple: true});
  }
}

module.exports = SQLite;
