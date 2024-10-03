'use strict';

const {Database} = require('node-sqlite3-wasm');

class Sqlite3WASM extends Database {
  constructor(...args) {
    super(...args);
  }

  static #cleanParameters(query, parameters) {
    return parameters
      ? Object.keys(parameters).reduce((obj, param) => {
          if (param[0] === '$') {
            obj[param] = parameters[param];
            return obj;
          }
          const $param = `$${param}`;
          if (query.includes($param)) {
            obj[$param] =
              parameters[param] === undefined ? null : parameters[param];
          }
          return obj;
        }, {})
      : parameters;
  }

  prepare(query) {
    const stmt = super.prepare(query);

    const run = stmt.run;
    stmt.run = (parameters) => {
      parameters = Sqlite3WASM.#cleanParameters(query, parameters);
      return run.call(stmt, parameters);
    };

    stmt.raw = (raw) => {
      stmt._raw = raw;
    };

    const get = stmt.get;
    stmt.get = (parameters) => {
      if (parameters) {
        parameters = Sqlite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      const result = get.call(stmt, parameters);
      return stmt._raw ? Object.values(result) : result;
    };

    const all = stmt.all;
    stmt.all = (parameters) => {
      if (parameters) {
        parameters = Sqlite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      const results = all.call(stmt, parameters);
      return stmt._raw ? results.map((row) => Object.values(row)) : results;
    };

    const iterate = stmt.iterate;
    stmt.iterate = (parameters) => {
      if (parameters) {
        parameters = Sqlite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      const it = iterate.call(stmt, parameters);

      let _it;
      if (stmt._raw) {
        _it = function* () {
          for (const row of it) {
            yield Object.values(row);
          }
        };
      }

      return stmt._raw ? _it() : it;
    };

    stmt.bind = (parameters) => {
      parameters = Sqlite3WASM.#cleanParameters(query, parameters);
      stmt._parameters = parameters;
      return stmt;
    };

    return stmt;
  }

  transaction(callback) {
    return (...args) => {
      super.exec('BEGIN TRANSACTION');
      try {
        callback(...args);
      } finally {
        super.exec('COMMIT TRANSACTION');
      }
    };
  }

  pragma(query, options) {
    if (options?.simple) {
      const name = query.replace(/[ ]*([^ ]+)[ ]*=.*/, '$1');
      return super.prepare(`pragma ${query}`).get()[name];
    }
    return super.prepare(`pragma ${query}`).all();
  }

  backup() {}
}

module.exports = Sqlite3WASM;
