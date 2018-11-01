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
      Object.keys(this._db).forEach(db => this.close(db));
    }
  }

  /**
   * Check if SQLite is usable.
   *
   * @return {Boolean} true if SQLite is available.
   */
  usable() {
    return !!this.Database;
  }

  /**
   *
   * @param {Object} resp - Response object provided by busClient.
   * @returns {Boolean} true if usable.
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
   * @param {Object} queries - Raw queries to prepare.
   * @param {function} onOpen - Callback just after opening the database.
   * @param {function} onMigrate - Callback for migrations.
   * @return {Boolean} false if SQLite is not available.
   */
  open(dbName, tables, queries, onOpen, onMigrate) {
    if (!this.usable()) {
      return false;
    }

    if (this._db[dbName]) {
      return true;
    }

    xFs.mkdir(this._dir);

    const dbPath = this._path(dbName);
    this._db[dbName] = new this.Database(dbPath);
    this._stmts[dbName] = {};

    if (onOpen) {
      onOpen();
    }

    this._db[dbName].exec(tables);

    if (onMigrate) {
      onMigrate();
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

  pragma(dbName, pragma) {
    if (!this.usable() || !this._db[dbName]) {
      return false;
    }
    return this._db[dbName].pragma(pragma, true);
  }
}

module.exports = SQLite;
