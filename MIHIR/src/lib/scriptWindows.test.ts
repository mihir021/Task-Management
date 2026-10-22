import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openOutputWindow, restoreOutputWindows } from './scriptWindows';
import type { ScriptRun } from '../types/scripts';

const run = (id: string, status: ScriptRun['status'] = 'Running') => ({ id, status }) as ScriptRun;
test('window restoration removes stale IDs and attaches existing running sessions', () => {
  assert.deepEqual(restoreOutputWindows(['gone', 'a', 'a'], [run('a'), run('b')]), ['a', 'b']);
  assert.deepEqual(restoreOutputWindows(null, [run('past', 'Passed')]), ['past']);
  assert.deepEqual(restoreOutputWindows(['past'], [run('past', 'Passed'), run('a'), run('b'), run('c')]), ['a', 'b', 'c']);
});
test('opening windows respects three views and can replace completed history', () => {
  const runs = [run('a'), run('b'), run('c', 'Passed'), run('d')];
  assert.deepEqual(openOutputWindow(['a', 'b'], 'b', runs), ['a', 'b']);
  assert.deepEqual(openOutputWindow(['a', 'b', 'c'], 'd', runs), ['a', 'b', 'd']);
  assert.throws(() => openOutputWindow(['a', 'b', 'd'], 'c', runs), /Three output windows/);
  assert.deepEqual(openOutputWindow(['a'], 'missing', runs), ['a']);
});
