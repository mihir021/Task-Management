import React, { useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  Plus,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Folder,
} from 'lucide-react';
import {
  ProjectConfig,
  RepositoryConfig,
  TaskRecord,
  WorkflowMode,
} from '../types/workspace';

interface ProjectsReposViewProps {
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  tasks: TaskRecord[];
  cloudTargetLabel: string;
  onSaveProject: (payload: Partial<ProjectConfig>) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onSaveRepository: (payload: Partial<RepositoryConfig>) => Promise<RepositoryConfig | null | void>;
  onDeleteRepository: (id: string) => Promise<void>;
  onOpenTasksForRepo: (repoName: string) => void;
}

export const ProjectsReposView: React.FC<ProjectsReposViewProps> = ({
  projects,
  repositories,
  tasks,
  cloudTargetLabel,
  onSaveProject,
  onDeleteProject,
  onSaveRepository,
  onDeleteRepository,
  onOpenTasksForRepo,
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  const [repoId, setRepoId] = useState<string>('');
  const [repoName, setRepoName] = useState('');
  const [repoProject, setRepoProject] = useState(projects[0]?.name || 'Ray');
  const [repoDesc, setRepoDesc] = useState('');
  const [repoRemoteUrl, setRepoRemoteUrl] = useState('');
  const [repoLocalPath, setRepoLocalPath] = useState('');
  const [repoBaseBranch, setRepoBaseBranch] = useState('development');
  const [repoDevBranch, setRepoDevBranch] = useState('development');
  const [repoCloudTarget, setRepoCloudTarget] = useState('cloud-release');
  const [repoCloudType, setRepoCloudType] = useState<RepositoryConfig['cloudTargetType']>('Branch');
  const [repoWorkflowMode, setRepoWorkflowMode] = useState<WorkflowMode>('PR-Based');

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPath = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleEditRepo = (repo: RepositoryConfig) => {
    setRepoId(repo.id);
    setRepoName(repo.name);
    setRepoProject(repo.projectName);
    setRepoDesc(repo.description);
    setRepoRemoteUrl(repo.remoteUrl);
    setRepoLocalPath(repo.localFolderPath);
    setRepoBaseBranch(repo.defaultBaseBranch);
    setRepoDevBranch(repo.defaultDevBranch);
    setRepoCloudTarget(repo.cloudTargetName);
    setRepoCloudType(repo.cloudTargetType);
    setRepoWorkflowMode(repo.defaultWorkflowMode);
  };

  const handleResetRepoForm = () => {
    setRepoId('');
    setRepoName('');
    setRepoDesc('');
    setRepoRemoteUrl('');
    setRepoLocalPath('');
    setRepoBaseBranch('development');
    setRepoDevBranch('development');
    setRepoCloudTarget('cloud-release');
  };

  const handleSaveRepoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim()) return;
    await onSaveRepository({
      id: repoId || undefined,
      name: repoName.trim(),
      projectName: repoProject,
      description: repoDesc.trim(),
      remoteUrl: repoRemoteUrl.trim(),
      localFolderPath: repoLocalPath.trim(),
      defaultBaseBranch: repoBaseBranch.trim() || 'development',
      defaultDevBranch: repoDevBranch.trim() || 'development',
      cloudTargetName: repoCloudTarget.trim() || 'cloud-release',
      cloudTargetType: repoCloudType,
      defaultWorkflowMode: repoWorkflowMode,
    });
    handleResetRepoForm();
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Projects & Repositories
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Configure workspace folder paths, remote Git URLs, default base/development branches, and {cloudTargetLabel.toLowerCase()}s. Local folder paths are stored as copyable reference records.
        </p>
      </div>

      {/* Configured Repositories Grid */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Configured Repositories ({repositories.length})
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {repositories.map((repo) => {
            const linkedTaskCount = tasks.filter(
              (t) =>
                !t.isArchived &&
                t.repositories.some((r) => r.repositoryName === repo.name)
            ).length;

            return (
              <div
                key={repo.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {repo.name}
                        </span>
                        <span className="text-xs text-slate-500">· {repo.projectName}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {repo.description || 'Repository configuration'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditRepo(repo)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRepository(repo.id)}
                        aria-label={`Delete repository ${repo.name}`}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Remote URL */}
                  {repo.remoteUrl && (
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                      <span className="truncate">{repo.remoteUrl}</span>
                      {repo.remoteUrl.startsWith('http') && (
                        <a
                          href={repo.remoteUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open remote URL for ${repo.name}`}
                          className="text-indigo-600 dark:text-indigo-400 shrink-0 ml-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Branch Defaults */}
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">Base Branch</span>
                      <span className="text-slate-800 dark:text-slate-200">{repo.defaultBaseBranch}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">
                        {repo.cloudTargetType}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {repo.cloudTargetName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">Workflow Mode</span>
                      <span className="text-slate-800 dark:text-slate-200">
                        {repo.defaultWorkflowMode}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-500 tabular-nums">
                    {linkedTaskCount} active task(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTasksForRepo(repo.name)}
                    className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                  >
                    View Tasks →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Repository Form & Projects Management */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleSaveRepoSubmit}
          className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {repoId ? `Edit Repository: ${repoName}` : 'Add or Configure Repository'}
            </h3>
            {repoId && (
              <button
                type="button"
                onClick={handleResetRepoForm}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="cfg-repo-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Repository / Custom Folder Name *
              </label>
              <input
                id="cfg-repo-name"
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="e.g., raydashboard or custom-folder"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="cfg-repo-project" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project
              </label>
              <select
                id="cfg-repo-project"
                value={repoProject}
                onChange={(e) => setRepoProject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cfg-repo-workflow" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default Workflow Mode
              </label>
              <select
                id="cfg-repo-workflow"
                value={repoWorkflowMode}
                onChange={(e) => setRepoWorkflowMode(e.target.value as WorkflowMode)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="PR-Based">PR-Based</option>
                <option value="Direct Merge">Direct Merge</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cfg-repo-base" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default Base Branch
              </label>
              <input
                id="cfg-repo-base"
                type="text"
                value={repoBaseBranch}
                onChange={(e) => {
                  setRepoBaseBranch(e.target.value);
                  setRepoDevBranch(e.target.value);
                }}
                placeholder="development2"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="cfg-repo-remote" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Remote Git URL (Optional)
              </label>
              <input
                id="cfg-repo-remote"
                type="text"
                value={repoRemoteUrl}
                onChange={(e) => setRepoRemoteUrl(e.target.value)}
                placeholder="https://git.ray.internal/ray/raydashboard.git"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cfg-repo-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description / Notes
            </label>
            <input
              id="cfg-repo-desc"
              type="text"
              value={repoDesc}
              onChange={(e) => setRepoDesc(e.target.value)}
              placeholder="Service responsibility and build notes..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              {repoId ? 'Save Repository Changes' : 'Save Repository'}
            </button>
          </div>
        </form>

        {/* Projects List & Form */}
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Projects ({projects.length})
          </h3>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {projects.map((p) => (
              <li key={p.id} className="py-2.5 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                  <div className="text-slate-500 mt-0.5">{p.description}</div>
                </div>
                {projects.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteProject(p.id)}
                    aria-label={`Delete project ${p.name}`}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjectName.trim()) return;
              await onSaveProject({
                name: newProjectName.trim(),
                description: newProjectDesc.trim(),
              });
              setNewProjectName('');
              setNewProjectDesc('');
            }}
            className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800"
          >
            <div>
              <label htmlFor="new-proj-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Project Name
              </label>
              <input
                id="new-proj-name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., Ray Cloud Core"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label htmlFor="new-proj-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <input
                id="new-proj-desc"
                type="text"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder="Project scope..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 text-xs font-medium text-white bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 rounded-lg"
            >
              + Add Project
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
