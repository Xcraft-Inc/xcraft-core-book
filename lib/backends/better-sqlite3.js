'use strict';

const path = require('node:path');
const fse = require('fs-extra');
const Database = require('better-sqlite3');

class BetterSQLite3 extends Database {
  constructor(dbPath, options) {
    BetterSQLite3.#loadModule(options);
    super(dbPath, options);
  }

  static #loadModule(options) {
    /* See xcraft-dev-sqlite node module */
    const cacheDir = path.join(
      __dirname,
      '../../../../node_modules/.cache/better-sqlite3'
    );

    if (process.versions.electron) {
      /* Try to load the cached electron version of better-sqlite3 */
      const betterSqlite = path.join(cacheDir, 'electron_better_sqlite3.node');
      if (fse.existsSync(betterSqlite)) {
        options.nativeBinding = betterSqlite;
      }
    } else {
      /* Try to load the cached node version of better-sqlite3 */
      const betterSqlite = path.join(cacheDir, 'node_better_sqlite3.node');
      if (fse.existsSync(betterSqlite)) {
        options.nativeBinding = betterSqlite;
      }
    }
  }
}

module.exports = BetterSQLite3;
