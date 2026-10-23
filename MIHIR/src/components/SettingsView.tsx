import { DatabaseStatus } from './DatabaseStatus';
import React, { useRef, useState } from 'react';
import {
  Sun,
  Moon,
  Download,
  Upload,
  Database,
  ShieldCheck,
  Tag,
  Trash2,
  RotateCcw,
  Plus,
  Copy,
  Check,
} from 'lucide-react';
import {
  DuplicatePolicy,
  WorkspaceSettings,
  WorkspaceStatePayload,
} from '../types/workspace';

interface SettingsViewProps {
  settings: WorkspaceSettings;
  storageInfo: WorkspaceStatePayload['storageInfo'];
  hasDemoTasks: boolean;
  onUpdateSettings: (updates: Partial<WorkspaceSettings>) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: (bundle: any, duplicatePolicy: DuplicatePolicy) => Promise<{
    importedTasks: number;
    skippedTasks: number;
    restoredFiles: number;
  }>;
  onClearDemoData: () => Promise<void>;
  onRestoreDemoData: () => Promise<void>;
}

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Tokyo',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  storageInfo,
  hasDemoTasks,
  onUpdateSettings,
  onExportBackup,
  onRestoreBackup,
  onClearDemoData,
  onRestoreDemoData,
}) => {
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [newTag, setNewTag] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('overwrite');
  const [restoreMessage, setRestoreMessage] = useState<string>('');
  const [restoreError, setRestoreError] = useState<string>('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedPath(key);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    setRestoreMessage('');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await onRestoreBackup(parsed, duplicatePolicy);
      setRestoreMessage(
        `Restore complete: ${res.importedTasks} task(s) imported, ${res.skippedTasks} skipped, and ${res.restoredFiles} attachment file(s) written to MIHIR/uploads/.`
      );
    } catch (err: any) {
      setRestoreError(err?.message || 'Invalid backup JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  const checks = settings.requiredCompletionChecks;

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Workspace Settings & Backup
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Manage theme, timezone, workflow completion checks, persistent storage paths, and full backup/restore.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appearance, Timezone & Cloud Target Naming */}
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Appearance, Timezone & Workflow Defaults
          </h2>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Color Theme (Saved Preference)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  settings.theme === 'light'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light Theme
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  settings.theme === 'dark'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark Theme
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-timezone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Display Timezone
              </label>
              <select
                id="settings-timezone"
                value={settings.timezone}
                onChange={(e) => onUpdateSettings({ timezone: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settings-max-mb" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Max Attachment Size (MB)
              </label>
              <input
                id="settings-max-mb"
                type="number"
                min={1}
                max={50}
                value={settings.maxAttachmentSizeMB}
                onChange={(e) =>
                  onUpdateSettings({ maxAttachmentSizeMB: Number(e.target.value) || 10 })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-cloud-label" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Custom "Cloud / Release" Target Label
              </label>
              <input
                id="settings-cloud-label"
                type="text"
                value={settings.cloudTargetLabel}
                onChange={(e) => onUpdateSettings({ cloudTargetLabel: e.target.value })}
                placeholder="Cloud / Release Target"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="settings-workflow-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default Git Workflow Mode
              </label>
              <select
                id="settings-workflow-mode"
                value={settings.defaultWorkflowMode}
                onChange={(e) =>
                  onUpdateSettings({ defaultWorkflowMode: e.target.value as any })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="PR-Based">PR-Based Merge Workflow</option>
                <option value="Direct Merge">Direct Merge Workflow</option>
              </select>
            </div>
          </div>
        </div>

        {/* Required Task Completion Checks */}
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Required Task Completion Checks
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Configure which engineering verification checks are required before a task shows as ready for completion.
          </p>

          <div className="space-y-3 text-xs">
            {(
              [
                ['requireNoBlockedTests', 'Require zero Blocked test checks (Blocked tests never count as passed)'],
                ['requireAllTestsPassedOrSkipped', 'Require at least one test record and zero Not Run checks'],
                ['requireGitCommitAndPush', 'Require Local Commit and Remote Push stages completed for all attached repos'],
                ['requireDevMerge', 'Require Merge into Development Target completed for all attached repos'],
                ['requireRootCauseAndSolution', 'Require Root Cause and Final Solution documented in Investigation'],
              ] as Array<[keyof typeof checks, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) =>
                    onUpdateSettings({
                      requiredCompletionChecks: {
                        ...checks,
                        [key]: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-slate-800 dark:text-slate-200 font-medium">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Backup, Restore & Storage Locations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Complete Backup Export & Validated Restore
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Export a single self-contained backup file containing all SQLite structured records (tasks, Git stages, changed files, test results, time logs, settings) AND base64-encoded screenshot attachments.
          </p>

          {restoreMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
              {restoreMessage}
            </div>
          )}

          {restoreError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {restoreError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              <Download className="w-4 h-4" />
              Export Full Backup (.json + Attachments)
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Restore from Backup File
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <label htmlFor="duplicate-policy" className="block text-[11px] text-slate-500 mb-1">
                  Duplicate Task ID Handling Policy
                </label>
                <select
                  id="duplicate-policy"
                  value={duplicatePolicy}
                  onChange={(e) => setDuplicatePolicy(e.target.value as DuplicatePolicy)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="overwrite">Overwrite existing records with backup version</option>
                  <option value="skip">Skip tasks that already exist in workspace</option>
                  <option value="duplicate">Import duplicates as new MIHIR-XXX copies</option>
                </select>
              </div>

              <div className="pt-4">
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => restoreInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" />
                  Select Backup JSON to Restore
                </button>
              </div>
            </div>
          </div>

          <DatabaseStatus />
          {/* Documented Database & Uploads Locations */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Documented Persistent Storage Locations
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">Database: {storageInfo.databasePath}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('db', storageInfo.databasePath)}
                  className="text-indigo-600 dark:text-indigo-400 shrink-0"
                >
                  {copiedPath === 'db' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">Attachments: {storageInfo.databasePath.startsWith('cloud:') ? 'Cloud database' : storageInfo.uploadsPath}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('up', storageInfo.uploadsPath)}
                  className="text-indigo-600 dark:text-indigo-400 shrink-0"
                >
                  {copiedPath === 'up' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tags Catalog & Demo Dataset Management */}
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Workspace Tags ({settings.tags.length})
              </h2>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const cleaned = newTag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
                if (!cleaned || settings.tags.includes(cleaned)) return;
                await onUpdateSettings({ tags: [...settings.tags, cleaned] });
                setNewTag('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                aria-label="New tag name"
                placeholder="Add new tag (e.g. envoy-config)..."
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Tag
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {settings.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        tags: settings.tags.filter((t) => t !== tag),
                      })
                    }
                    aria-label={`Remove tag ${tag}`}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sample Ray Dataset Controls
            </h2>
            <p className="text-xs text-slate-500">
              Remove the 4 illustrative sample Ray tasks (`MIHIR-001` through `MIHIR-004`) at any time without losing your own created tasks, or restore the sample tasks for reference.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {hasDemoTasks ? (
                <button
                  type="button"
                  onClick={onClearDemoData}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove Illustrative Demo Dataset
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRestoreDemoData}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore Sample Ray Dataset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
