import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";
import pg, { type PoolClient } from "pg";

type Row = Record<string, SQLOutputValue>;
export interface Store {
  prepare(sql: string): {
    get(...values: SQLInputValue[]): Promise<Row | undefined>;
    all(...values: SQLInputValue[]): Promise<Row[]>;
    run(...values: SQLInputValue[]): Promise<{ changes: number }>;
  };
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function sqliteStore(raw: DatabaseSync): Store {
  const context = new AsyncLocalStorage<boolean>();
  let tail = Promise.resolve();
  function exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    if (context.getStore()) return Promise.resolve().then(fn);
    const result = tail.then(fn);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    prepare(sql) {
      return {
        get: (...values) => exclusive(() => raw.prepare(sql).get(...values)),
        all: (...values) => exclusive(() => raw.prepare(sql).all(...values)),
        run: (...values) =>
          exclusive(() => ({
            changes: Number(raw.prepare(sql).run(...values).changes),
          })),
      };
    },
    transaction: (fn) =>
      exclusive(() =>
        context.run(true, async () => {
          raw.exec("BEGIN");
          try {
            const result = await fn();
            raw.exec("COMMIT");
            return result;
          } catch (error) {
            raw.exec("ROLLBACK");
            throw error;
          }
        }),
      ),
    close: () => exclusive(() => raw.close()),
  };
}

export function postgresSql(sql: string) {
  let parameter = 0;
  // Application queries are fixed SQL with no question marks in string literals.
  let text = sql.replace(/\?/g, () => `$${++parameter}`);
  if (/INSERT OR IGNORE/i.test(text))
    text =
      text.replace(/INSERT OR IGNORE/i, "INSERT") + " ON CONFLICT DO NOTHING";
  return text
    .replace(/AS (sharedCount|originalCount)/g, 'AS "$1"')
    .replace(
      /\b(FROM|JOIN|INTO|UPDATE) (users|sessions|works|originals|shares|templates|requests|company_formats|transfers|transfer_parts)\b/gi,
      "$1 hrbip.$2",
    );
}

export function postgresStore(connectionString: string): Store {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    query_timeout: 15000,
  });
  pool.on("error", () =>
    console.error(
      "Database connection was interrupted; the next request will reconnect.",
    ),
  );
  const context = new AsyncLocalStorage<PoolClient>();
  async function query(sql: string, values: SQLInputValue[]) {
    return (context.getStore() || pool).query(postgresSql(sql), values);
  }
  return {
    prepare(sql) {
      return {
        get: async (...values) =>
          (await query(sql, values)).rows[0] as Row | undefined,
        all: async (...values) => (await query(sql, values)).rows as Row[],
        run: async (...values) => ({
          changes: (await query(sql, values)).rowCount || 0,
        }),
      };
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await context.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
