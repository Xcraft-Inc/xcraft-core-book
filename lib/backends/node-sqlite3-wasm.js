'use strict';

const {Database} = require('node-sqlite3-wasm');

class NodeSQLite3WASM extends Database {
  static #cleanParameters(query, parameters) {
    if (Array.isArray(parameters)) {
      return parameters;
    }
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
      parameters = NodeSQLite3WASM.#cleanParameters(query, parameters);
      try {
        return run.call(stmt, parameters);
      } finally {
        stmt._reset();
      }
    };

    stmt.raw = (raw) => {
      stmt._raw = raw;
      return stmt;
    };

    const get = stmt.get;
    stmt.get = (parameters) => {
      if (parameters) {
        parameters = NodeSQLite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      try {
        const result = get.call(stmt, parameters);
        return stmt._raw && result ? Object.values(result) : result;
      } finally {
        stmt._reset();
      }
    };

    const all = stmt.all;
    stmt.all = (parameters) => {
      if (parameters) {
        parameters = NodeSQLite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      try {
        const results = all.call(stmt, parameters);
        return stmt._raw && results
          ? results.map((row) => Object.values(row))
          : results;
      } finally {
        stmt._reset();
      }
    };

    const iterate = stmt.iterate;
    stmt.iterate = (parameters) => {
      if (parameters) {
        parameters = NodeSQLite3WASM.#cleanParameters(query, parameters);
      } else {
        parameters = stmt._parameters;
      }
      const it = iterate.call(stmt, parameters);

      return (function* () {
        for (const row of it) {
          yield stmt._raw && row ? Object.values(row) : row;
        }
        stmt._reset();
      })();
    };

    stmt.bind = (parameters) => {
      parameters = NodeSQLite3WASM.#cleanParameters(query, parameters);
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

  backup() {}

  unsafeMode() {}
}

module.exports = NodeSQLite3WASM;
