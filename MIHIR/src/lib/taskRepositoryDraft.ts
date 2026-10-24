import type { TaskRepository } from '../types/workspace';

// Branch edits must not overwrite Git stages saved from another task tab.
export function mergeTaskRepositoryDraft(current: TaskRepository[], draft: TaskRepository[]): TaskRepository[] {
  return draft.map(repo => {
    const latest = current.find(item => item.id === repo.id);
    return {
      ...repo,
      ...latest,
      baseBranch: repo.baseBranch,
      workingBranch: repo.workingBranch,
      devTargetBranch: repo.devTargetBranch,
    };
  });
}
