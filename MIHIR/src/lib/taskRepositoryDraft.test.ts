import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskRepositoryDraft } from './taskRepositoryDraft';
import type { TaskRepository } from '../types/workspace';
const repo = (id: string, extras: Partial<TaskRepository> = {}) => ({ id, repositoryName: id, baseBranch:'development', workingBranch:'old', devTargetBranch:'development', stages: [], ...extras } as TaskRepository);
test('saving branch edits preserves Git progress saved after the draft opened', () => {
  const draft = repo('one', { workingBranch:'feature/fix', baseBranch:'main', devTargetBranch:'main' });
  const current = repo('one', { stages:[{ id:'stage-1', completed:true }] as any, cloudTargetName:'production' });
  const [saved] = mergeTaskRepositoryDraft([current], [draft]);
  assert.equal(saved.workingBranch,'feature/fix'); assert.equal(saved.baseBranch,'main');
  assert.equal(saved.cloudTargetName,'production'); assert.deepEqual(saved.stages,current.stages);
});
test('a single save retains new folders and intentionally removed folders stay removed', () => {
  const current = [repo('one'),repo('two')];
  const draft = [repo('two',{workingBranch:'branch-two'}),repo('three',{workingBranch:'branch-three'})];
  const saved = mergeTaskRepositoryDraft(current,draft);
  assert.deepEqual(saved.map(r=>r.id),['two','three']);assert.equal(saved[0].workingBranch,'branch-two');assert.equal(saved[1].workingBranch,'branch-three');
  assert.equal(current[1].workingBranch,'old');
});
