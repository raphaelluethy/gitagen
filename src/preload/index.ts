import { contextBridge, ipcRenderer } from "electron";
import type {
	GroupedProject,
	Project,
	AppSettings,
	ProjectPrefs,
	RepoStatus,
	TreeNode,
	CommitDetail,
	CommitInfo,
	BranchInfo,
	StashEntry,
	RemoteInfo,
	CommitResult,
	ConflictState,
	WorktreeInfo,
	ConfigEntry,
	AIProviderDescriptor,
	AddWorktreeOptions,
	AddWorktreeResult,
	ConfirmDialogOptions,
} from "../shared/types.js";

const EVENT_REPO_UPDATED = "events:repoUpdated";
const EVENT_REPO_ERROR = "events:repoError";
const EVENT_CONFLICT_DETECTED = "events:conflictDetected";
const EVENT_AI_COMMIT_CHUNK = "ai:commitChunk";

const projects = {
	list: (): Promise<Project[]> => ipcRenderer.invoke("projects:list"),
	listGrouped: (): Promise<GroupedProject[]> => ipcRenderer.invoke("projects:listGrouped"),
	add: (name: string, path: string): Promise<Project> =>
		ipcRenderer.invoke("projects:add", name, path),
	remove: (projectId: string): Promise<void> => ipcRenderer.invoke("projects:remove", projectId),
	switchTo: (projectId: string): Promise<Project | null> =>
		ipcRenderer.invoke("projects:switchTo", projectId),
};

const repo = {
	getTree: (
		projectId: string,
		includeIgnored?: boolean,
		changedOnly?: boolean
	): Promise<TreeNode[]> =>
		ipcRenderer.invoke("repo:getTree", projectId, includeIgnored, changedOnly),
	getStatus: (projectId: string): Promise<RepoStatus | null> =>
		ipcRenderer.invoke("repo:getStatus", projectId),
	getPatch: (
		projectId: string,
		filePath: string,
		scope: "staged" | "unstaged" | "untracked"
	): Promise<string | null> => ipcRenderer.invoke("repo:getPatch", projectId, filePath, scope),
	openInEditor: (projectId: string, filePath: string): Promise<void> =>
		ipcRenderer.invoke("repo:openInEditor", projectId, filePath),
	refresh: (projectId: string): Promise<void> => ipcRenderer.invoke("repo:refresh", projectId),
	stageFiles: (projectId: string, paths: string[]): Promise<void> =>
		ipcRenderer.invoke("repo:stageFiles", projectId, paths),
	unstageFiles: (projectId: string, paths: string[]): Promise<void> =>
		ipcRenderer.invoke("repo:unstageFiles", projectId, paths),
	stageAll: (projectId: string): Promise<void> => ipcRenderer.invoke("repo:stageAll", projectId),
	unstageAll: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:unstageAll", projectId),
	discardFiles: (projectId: string, paths: string[]): Promise<void> =>
		ipcRenderer.invoke("repo:discardFiles", projectId, paths),
	discardAllUnstaged: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:discardAllUnstaged", projectId),
	commit: (
		projectId: string,
		message: string,
		opts?: { amend?: boolean; sign?: boolean }
	): Promise<CommitResult> => ipcRenderer.invoke("repo:commit", projectId, message, opts),
	generateCommitMessage: (projectId: string): Promise<string> =>
		ipcRenderer.invoke("repo:generateCommitMessage", projectId),
	getLog: (
		projectId: string,
		opts?: { limit?: number; branch?: string; offset?: number }
	): Promise<CommitInfo[]> => ipcRenderer.invoke("repo:getLog", projectId, opts),
	getCommitDetail: (projectId: string, oid: string): Promise<CommitDetail | null> =>
		ipcRenderer.invoke("repo:getCommitDetail", projectId, oid),
	listBranches: (projectId: string): Promise<BranchInfo[]> =>
		ipcRenderer.invoke("repo:listBranches", projectId),
	createBranch: (projectId: string, name: string, startPoint?: string): Promise<void> =>
		ipcRenderer.invoke("repo:createBranch", projectId, name, startPoint),
	switchBranch: (projectId: string, name: string): Promise<void> =>
		ipcRenderer.invoke("repo:switchBranch", projectId, name),
	deleteBranch: (projectId: string, name: string, force?: boolean): Promise<void> =>
		ipcRenderer.invoke("repo:deleteBranch", projectId, name, force),
	renameBranch: (projectId: string, oldName: string, newName: string): Promise<void> =>
		ipcRenderer.invoke("repo:renameBranch", projectId, oldName, newName),
	mergeBranch: (
		projectId: string,
		source: string,
		opts?: { noFf?: boolean; squash?: boolean; message?: string }
	): Promise<void> => ipcRenderer.invoke("repo:mergeBranch", projectId, source, opts),
	fetch: (projectId: string, opts?: { remote?: string; prune?: boolean }): Promise<void> =>
		ipcRenderer.invoke("repo:fetch", projectId, opts),
	pull: (
		projectId: string,
		opts?: { remote?: string; branch?: string; rebase?: boolean }
	): Promise<void> => ipcRenderer.invoke("repo:pull", projectId, opts),
	push: (
		projectId: string,
		opts?: {
			remote?: string;
			branch?: string;
			force?: boolean;
			setUpstream?: boolean;
		}
	): Promise<void> => ipcRenderer.invoke("repo:push", projectId, opts),
	listRemotes: (projectId: string): Promise<RemoteInfo[]> =>
		ipcRenderer.invoke("repo:listRemotes", projectId),
	addRemote: (projectId: string, name: string, url: string): Promise<void> =>
		ipcRenderer.invoke("repo:addRemote", projectId, name, url),
	removeRemote: (projectId: string, name: string): Promise<void> =>
		ipcRenderer.invoke("repo:removeRemote", projectId, name),
	stash: (
		projectId: string,
		opts?: { message?: string; includeUntracked?: boolean }
	): Promise<void> => ipcRenderer.invoke("repo:stash", projectId, opts),
	stashPop: (projectId: string, index?: number): Promise<void> =>
		ipcRenderer.invoke("repo:stashPop", projectId, index),
	stashApply: (projectId: string, index?: number): Promise<void> =>
		ipcRenderer.invoke("repo:stashApply", projectId, index),
	stashList: (projectId: string): Promise<StashEntry[]> =>
		ipcRenderer.invoke("repo:stashList", projectId),
	stashDrop: (projectId: string, index?: number): Promise<void> =>
		ipcRenderer.invoke("repo:stashDrop", projectId, index),
	listTags: (projectId: string): Promise<string[]> =>
		ipcRenderer.invoke("repo:listTags", projectId),
	createTag: (
		projectId: string,
		name: string,
		opts?: { message?: string; ref?: string; sign?: boolean }
	): Promise<void> => ipcRenderer.invoke("repo:createTag", projectId, name, opts),
	deleteTag: (projectId: string, name: string): Promise<void> =>
		ipcRenderer.invoke("repo:deleteTag", projectId, name),
	rebase: (projectId: string, opts: { onto: string }): Promise<void> =>
		ipcRenderer.invoke("repo:rebase", projectId, opts),
	rebaseAbort: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:rebaseAbort", projectId),
	rebaseContinue: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:rebaseContinue", projectId),
	rebaseSkip: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:rebaseSkip", projectId),
	cherryPick: (projectId: string, refs: string[]): Promise<void> =>
		ipcRenderer.invoke("repo:cherryPick", projectId, refs),
	cherryPickAbort: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:cherryPickAbort", projectId),
	cherryPickContinue: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:cherryPickContinue", projectId),
	getConflictFiles: (projectId: string): Promise<string[]> =>
		ipcRenderer.invoke("repo:getConflictFiles", projectId),
	markResolved: (projectId: string, paths: string[]): Promise<void> =>
		ipcRenderer.invoke("repo:markResolved", projectId, paths),
	getEffectiveConfig: (projectId: string): Promise<ConfigEntry[]> =>
		ipcRenderer.invoke("repo:getEffectiveConfig", projectId),
	setLocalConfig: (projectId: string, key: string, value: string): Promise<void> =>
		ipcRenderer.invoke("repo:setLocalConfig", projectId, key, value),
	testSigning: (projectId: string, key?: string): Promise<{ ok: boolean; message: string }> =>
		ipcRenderer.invoke("repo:testSigning", projectId, key),
	listWorktrees: (projectId: string): Promise<WorktreeInfo[]> =>
		ipcRenderer.invoke("repo:listWorktrees", projectId),
	addWorktree: (
		projectId: string,
		branch: string,
		options?: AddWorktreeOptions
	): Promise<AddWorktreeResult> =>
		ipcRenderer.invoke("repo:addWorktree", projectId, branch, options),
	removeWorktree: (projectId: string, worktreePath: string, force?: boolean): Promise<void> =>
		ipcRenderer.invoke("repo:removeWorktree", projectId, worktreePath, force),
	pruneWorktrees: (projectId: string): Promise<void> =>
		ipcRenderer.invoke("repo:pruneWorktrees", projectId),
};

const settings = {
	getGlobal: (): Promise<AppSettings> => ipcRenderer.invoke("settings:getGlobal"),
	getGlobalWithKeys: (): Promise<AppSettings> => ipcRenderer.invoke("settings:getGlobalWithKeys"),
	setGlobal: (partial: Partial<AppSettings>): Promise<AppSettings> =>
		ipcRenderer.invoke("settings:setGlobal", partial),
	getProjectPrefs: (projectId: string): Promise<ProjectPrefs | null> =>
		ipcRenderer.invoke("settings:getProjectPrefs", projectId),
	setProjectPrefs: (projectId: string, prefs: Partial<ProjectPrefs>): Promise<void> =>
		ipcRenderer.invoke("settings:setProjectPrefs", projectId, prefs),
	discoverGitBinaries: (): Promise<string[]> =>
		ipcRenderer.invoke("settings:discoverGitBinaries"),
	getSshAgentInfo: (): Promise<{ name: string; path: string | null }> =>
		ipcRenderer.invoke("settings:getSshAgentInfo"),
	selectGitBinary: (): Promise<string | null> => ipcRenderer.invoke("settings:selectGitBinary"),
	selectFolder: (): Promise<string | null> => ipcRenderer.invoke("settings:selectFolder"),
	fetchModels: (
		type: string,
		apiKey: string,
		baseURL?: string
	): Promise<{ success: boolean; models: string[]; error?: string }> =>
		ipcRenderer.invoke("settings:fetchModels", type, apiKey, baseURL),
	listAIProviders: (): Promise<AIProviderDescriptor[]> =>
		ipcRenderer.invoke("settings:listAIProviders"),
};

const events = {
	onRepoUpdated: (callback: (payload: { projectId: string; updatedAt: number }) => void) => {
		const handler = (
			_: Electron.IpcRendererEvent,
			payload: { projectId: string; updatedAt: number }
		) => {
			callback(payload);
		};
		ipcRenderer.on(EVENT_REPO_UPDATED, handler);
		return () => ipcRenderer.removeListener(EVENT_REPO_UPDATED, handler);
	},
	onRepoError: (
		callback: (payload: { projectId: string | null; message: string; name: string }) => void
	) => {
		const handler = (
			_: Electron.IpcRendererEvent,
			payload: { projectId: string | null; message: string; name: string }
		) => {
			callback(payload);
		};
		ipcRenderer.on(EVENT_REPO_ERROR, handler);
		return () => ipcRenderer.removeListener(EVENT_REPO_ERROR, handler);
	},
	onConflictDetected: (
		callback: (payload: { projectId: string; state: ConflictState }) => void
	) => {
		const handler = (
			_: Electron.IpcRendererEvent,
			payload: { projectId: string; state: ConflictState }
		) => {
			callback(payload);
		};
		ipcRenderer.on(EVENT_CONFLICT_DETECTED, handler);
		return () => ipcRenderer.removeListener(EVENT_CONFLICT_DETECTED, handler);
	},
	onCommitChunk: (callback: (chunk: string) => void) => {
		const handler = (_: Electron.IpcRendererEvent, chunk: string) => {
			callback(chunk);
		};
		ipcRenderer.on(EVENT_AI_COMMIT_CHUNK, handler);
		return () => ipcRenderer.removeListener(EVENT_AI_COMMIT_CHUNK, handler);
	},
};

const app = {
	openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),
	confirm: (options: ConfirmDialogOptions): Promise<boolean> =>
		ipcRenderer.invoke("app:confirm", options),
};

const api = {
	projects,
	repo,
	settings,
	events,
	app,
};

export type GitagenApi = typeof api;

declare global {
	interface Window {
		gitagen: GitagenApi;
	}
}

contextBridge.exposeInMainWorld("gitagen", api);
