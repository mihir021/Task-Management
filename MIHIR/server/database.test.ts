import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from './database';

test('local database persists writes across connections', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-database-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'test.sqlite'); const first = openDatabase(file, false);
  await first.exec('CREATE TABLE example (id TEXT PRIMARY KEY, value TEXT)');
  await first.prepare('INSERT INTO example VALUES (?, ?)').run('one', 'saved');
  const second = openDatabase(file, false);
  assert.equal((await second.prepare('SELECT value FROM example WHERE id = ?').get('one'))?.value, 'saved');
});
test('hosted database refuses ephemeral memory fallback when credentials are absent', () => {
  const original = process.env.TURSO_DATABASE_URL; delete process.env.TURSO_DATABASE_URL;
  try {
    const db = openDatabase(':memory:', true); assert.equal(db.configured, false);
    assert.throws(() => db.prepare('SELECT 1').get(), /Cloud database is not configured/);
  } finally { if (original !== undefined) process.env.TURSO_DATABASE_URL = original; }
});
