'use strict';

const Database = require('bun:sqlite').default;

class BunSQLite extends Database {
  constructor(dbPath, options) {
    super(dbPath);
  }

  pragma(query, options) {
    const stmt = super.prepare(`pragma ${query}`);
    try {
      if (options?.simple) {
        const name = query.replace(/[ ]*([^ ]+)[ ]*=.*/, '$1');
        return stmt.get()[name];
      }
      return stmt.all();
    } finally {
      stmt.finalize();
    }
  }

  function() {
    throw new Error('Database.function is not supported by Bun');
  }
}

module.exports = BunSQLite;
