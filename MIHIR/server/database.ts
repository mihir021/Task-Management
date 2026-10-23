import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createClient } from '@libsql/client/http';
import type { InValue } from '@libsql/client';

// Local installations keep their existing SQLite file. Vercel must use durable storage.
export function openDatabase(localPath: string, hosted: boolean) {
  const url = process.env.TURSO_DATABASE_URL;
  if (url && (hosted || process.env.MIHIR_USE_CLOUD_DB === 'true')) {
    if (!/^libsql:\/\//.test(url) && !/^https:\/\//.test(url)) throw new Error('Cloud database requires a libsql:// or HTTPS URL.');
    if (!process.env.TURSO_AUTH_TOKEN) throw new Error('TURSO_AUTH_TOKEN is required.');
    const remote = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    return {
      provider: 'turso' as const,
      configured: true,
      async exec(sql: string) { await remote.executeMultiple(sql); },
      prepare(sql: string) {
        const execute = (...args: SQLInputValue[]) => remote.execute({ sql, args: args as InValue[] });
        return {
          async all(...args: SQLInputValue[]) { return (await execute(...args)).rows; },
          async get(...args: SQLInputValue[]) { return (await execute(...args)).rows[0]; },
          async run(...args: SQLInputValue[]) { await execute(...args); },
        };
      },
    };
  }
  if (hosted) {
    const unavailable = () => { throw new Error('Cloud database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.'); };
    return { provider: 'unconfigured' as const, configured: false, exec: unavailable,
      prepare: () => ({ all: unavailable, get: unavailable, run: unavailable }) };
  }
  const local = new DatabaseSync(localPath);
  local.exec('PRAGMA journal_mode = WAL');
  return {
    provider: 'sqlite' as const, configured: true,
    async exec(sql: string) { local.exec(sql); },
    prepare(sql: string) {
      const statement = local.prepare(sql);
      return {
        async all(...args: SQLInputValue[]) { return statement.all(...args); },
        async get(...args: SQLInputValue[]) { return statement.get(...args); },
        async run(...args: SQLInputValue[]) { statement.run(...args); },
      };
    },
  };
}
