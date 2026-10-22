import type { ScriptRun } from '../types/scripts';

export function openOutputWindow(ids: string[], id: string, runs: ScriptRun[]): string[] {
  const valid = ids.filter(value => runs.some(run => run.id === value)).slice(0, 3);
  if (valid.includes(id)) return valid;
  if (!runs.some(run => run.id === id)) return valid;
  if (valid.length < 3) return [...valid, id];
  const replace = valid.findIndex(value => runs.find(run => run.id === value)?.status !== 'Running');
  if (replace === -1) throw new Error('Three output windows are open. Close a view before opening another. Closing a view leaves its process running.');
  return valid.map((value, index) => index === replace ? id : value);
}

export function restoreOutputWindows(saved: unknown, runs: ScriptRun[]): string[] {
  const valid = Array.isArray(saved) ? [...new Set(saved.filter(id => typeof id === 'string' && runs.some(run => run.id === id)))] as string[] : [];
  const running = runs.filter(run => run.status === 'Running').map(run => run.id);
  const ids = [...valid.filter(id => running.includes(id)), ...running.filter(id => !valid.includes(id)), ...valid.filter(id => !running.includes(id))].slice(0, 3);
  if (!ids.length && runs[0]) ids.push(runs[0].id);
  return ids;
}
