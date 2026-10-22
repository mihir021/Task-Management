import { TaskRecord } from '../types/workspace';

export function getNextTaskCodeFromList(tasks: TaskRecord[]): string {
  let maxNum = 0;
  for (const t of tasks) {
    const match = t.taskCode.match(/MIHIR-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `MIHIR-${String(maxNum + 1).padStart(3, '0')}`;
}
