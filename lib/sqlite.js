'use strict';

const path = require('path');
const xFs = require('xcraft-core-fs');
const xLog = require('xcraft-core-log')('sqlite');

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SQLite {
  constructor(location, skip = false, wasm = false) {
    this._stmts = {};
    this._db = {};
    this._dir = location;
    this._getHandle = null;
    this._backend = wasm ? 'node-sqlite3-wasm.js' : 'better-sqlite3.js';
    this.Database = null;
    SQLite.prototype._init.call(this, skip);
  }

  _init(skip) {
    if (skip) {
      return;
    }
    try {
      this.Database = require(`./backends/${this._backend}`);
    } catch (ex) {
      xLog.warn(ex.stack || ex.message || ex);
    }
  }

  _path(dbName) {
    return path.join(this._dir, `${dbName}.db`);
  }

  _onError() {
    xLog.info('sqlite3 is not supported on this platform');
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

  getAllNames() {
    return Object.keys(this._db);
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
   * @returns {boolean} true if usable.
   */
  tryToUse() {
    if (!this.usable()) {
      SQLite.prototype._onError.call(this);
      return false;
    }
    return true;
  }

  getHandle(dbName) {
    return this.usable() ? () => this._db[dbName] : null;
  }

  timestamp() {
    return new Date().toISOString();
  }

  inTransaction(dbName) {
    return this._db[dbName].inTransaction;
  }

  /**
   * Open (and create if necessary) a SQLite database.
   *
   * @param {string} dbName - Database name used for the database file.
   * @param {string} tables - Main queries for creating the tables.
   * @param {object} queries - Raw queries to prepare.
   * @param {Function} [onOpen] - Callback just after opening the database.
   * @param {Function} [onMigrate] - Callback for migrations.
   * @param {string} [indices] - Main indices.
   * @param {object} [options]
   * @returns {boolean} false if SQLite is not available.
   */
  open(dbName, tables, queries, onOpen, onMigrate, indices, options) {
    if (!this.usable()) {
      return false;
    }

    if (this._db[dbName]?.open) {
      return true;
    }

    /* Use a third handle if provided */
    if (this._getHandle) {
      this._db[dbName] = this._getHandle();
    }

    xFs.mkdir(this._dir);

    const dbPath = this._path(dbName);
    options = {...options, timeout: 100};

    if (!this._db[dbName]?.open) {
      this._db[dbName] = new this.Database(dbPath, options);
    }
    this._stmts[dbName] = {};

    if (onOpen) {
      onOpen();
    }

    if (tables) {
      this._db[dbName].exec(tables);
    }

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

  dispose() {
    for (const db of Object.keys(this._db)) {
      try {
        this.close(db);
      } catch (ex) {
        xLog.warn(ex.stack || ex.message || ex);
      }
    }
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

  static async wait(handler) {
    let res;
    for (let wait = true; wait; ) {
      try {
        res = handler();
        wait = false;
      } catch (ex) {
        wait =
          ex.code === 'SQLITE_BUSY' ||
          ex.code === 'SQLITE_LOCKED' ||
          (ex.message && ex.message.endsWith('database is locked')) ||
          // See https://github.com/WiseLibs/better-sqlite3/issues/203
          // 'This database connection is busy executing a query'
          // 'This statement is busy executing a query'
          (ex.message && ex.message.endsWith('is busy executing a query'));
        if (!wait) {
          throw ex;
        }
        await timeout(400);
      }
    }
    return res;
  }
}

module.exports = SQLite;
