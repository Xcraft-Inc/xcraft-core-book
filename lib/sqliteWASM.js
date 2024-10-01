'use strict';

const {Database} = require('node-sqlite3-wasm');

class Sqlite3WASM extends Database {
  constructor(...args) {
    super(...args);
  }
}

module.exports = Sqlite3WASM;
