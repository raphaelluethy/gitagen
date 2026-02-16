import { contextBridge, ipcRenderer } from "electron";
import type {
	GroupedProject,
	Project,
	ProjectOpenData,
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
	FetchResultSummary,
	PullResultSummary,
	PushResultSummary,
} from "../shared/types.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
	return UUID_REGEX.test(id);
}

function isValidPath(path: string): boolean {
	if (path.includes("\0")) return false;
	if (path.includes("..")) return false;
	return true;
}

function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function validateProjectId(projectId: string): void {
	if (!isValidUUID(projectId)) {
		throw new Error("Invalid project ID format");
	}
}

function validatePath(path: string): void {
	if (!isValidPath(path)) {
		throw new Error("Invalid path: path traversal not allowed");
	}
}

function validateUrl(url: string): void {
	if (!isValidUrl(url)) {
		throw new Error("Invalid URL: only http and https are allowed");
	}
}

const EVENT_REPO_UPDATED = "events:repoUpdated";
const EVENT_REPO_ERROR = "events:repoError";
const EVENT_CONFLICT_DETECTED = "events:conflictDetected";
const EVENT_OPEN_REPO = "events:openRepo";
const EVENT_AI_COMMIT_CHUNK = "ai:commitChunk";

const projects = {
	list: (): Promise<Project[]> => ipcRenderer.invoke("projects:list"),
	listGrouped: (): Promise<GroupedProject[]> => ipcRenderer.invoke("projects:listGrouped"),
	add: (name: string, path: string): Promise<Project> => {
		validatePath(path);
		return ipcRenderer.invoke("projects:add", name, path);
	},
	remove: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("projects:remove", projectId);
	},
	switchTo: (projectId: string): Promise<Project | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("projects:switchTo", projectId);
	},
};

const repo = {
	openProject: (projectId: string): Promise<ProjectOpenData | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:openProject", projectId);
	},
	getTree: (
		projectId: string,
		includeIgnored?: boolean,
		changedOnly?: boolean
	): Promise<TreeNode[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getTree", projectId, includeIgnored, changedOnly);
	},
	getStatus: (projectId: string): Promise<RepoStatus | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getStatus", projectId);
	},
	getPatch: (
		projectId: string,
		filePath: string,
		scope: "staged" | "unstaged" | "untracked"
	): Promise<string | null> => {
		validateProjectId(projectId);
		validatePath(filePath);
		return ipcRenderer.invoke("repo:getPatch", projectId, filePath, scope);
	},
	getAllDiffs: (projectId: string): Promise<{ path: string; scope: string; diff: string }[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getAllDiffs", projectId);
	},
	openInEditor: (projectId: string, filePath: string): Promise<void> => {
		validateProjectId(projectId);
		validatePath(filePath);
		return ipcRenderer.invoke("repo:openInEditor", projectId, filePath);
	},
	refresh: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:refresh", projectId);
	},
	stageFiles: (projectId: string, paths: string[]): Promise<void> => {
		validateProjectId(projectId);
		paths.forEach(validatePath);
		return ipcRenderer.invoke("repo:stageFiles", projectId, paths);
	},
	unstageFiles: (projectId: string, paths: string[]): Promise<void> => {
		validateProjectId(projectId);
		paths.forEach(validatePath);
		return ipcRenderer.invoke("repo:unstageFiles", projectId, paths);
	},
	stageAll: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stageAll", projectId);
	},
	unstageAll: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:unstageAll", projectId);
	},
	discardFiles: (projectId: string, paths: string[]): Promise<void> => {
		validateProjectId(projectId);
		paths.forEach(validatePath);
		return ipcRenderer.invoke("repo:discardFiles", projectId, paths);
	},
	discardAllUnstaged: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:discardAllUnstaged", projectId);
	},
	commit: (
		projectId: string,
		message: string,
		opts?: { amend?: boolean; sign?: boolean }
	): Promise<CommitResult> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:commit", projectId, message, opts);
	},
	undoLastCommit: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:undoLastCommit", projectId);
	},
	getUnpushedOids: (projectId: string): Promise<string[] | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getUnpushedOids", projectId);
	},
	generateCommitMessage: (projectId: string): Promise<string> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:generateCommitMessage", projectId);
	},
	getLog: (
		projectId: string,
		opts?: { limit?: number; branch?: string; offset?: number }
	): Promise<CommitInfo[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getLog", projectId, opts);
	},
	getCachedLog: (projectId: string): Promise<CommitInfo[] | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getCachedLog", projectId);
	},
	getCommitDetail: (projectId: string, oid: string): Promise<CommitDetail | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getCommitDetail", projectId, oid);
	},
	listBranches: (projectId: string): Promise<BranchInfo[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:listBranches", projectId);
	},
	createBranch: (projectId: string, name: string, startPoint?: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:createBranch", projectId, name, startPoint);
	},
	switchBranch: (projectId: string, name: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:switchBranch", projectId, name);
	},
	deleteBranch: (projectId: string, name: string, force?: boolean): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:deleteBranch", projectId, name, force);
	},
	renameBranch: (projectId: string, oldName: string, newName: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:renameBranch", projectId, oldName, newName);
	},
	mergeBranch: (
		projectId: string,
		source: string,
		opts?: { noFf?: boolean; squash?: boolean; message?: string }
	): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:mergeBranch", projectId, source, opts);
	},
	fetch: (
		projectId: string,
		opts?: { remote?: string; prune?: boolean }
	): Promise<FetchResultSummary> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:fetch", projectId, opts);
	},
	pull: (
		projectId: string,
		opts?: {
			remote?: string;
			branch?: string;
			rebase?: boolean;
			behind?: number;
		}
	): Promise<PullResultSummary> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:pull", projectId, opts);
	},
	push: (
		projectId: string,
		opts?: {
			remote?: string;
			branch?: string;
			force?: boolean;
			setUpstream?: boolean;
			ahead?: number;
		}
	): Promise<PushResultSummary> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:push", projectId, opts);
	},
	listRemotes: (projectId: string): Promise<RemoteInfo[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:listRemotes", projectId);
	},
	addRemote: (projectId: string, name: string, url: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:addRemote", projectId, name, url);
	},
	removeRemote: (projectId: string, name: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:removeRemote", projectId, name);
	},
	stash: (
		projectId: string,
		opts?: { message?: string; includeUntracked?: boolean }
	): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stash", projectId, opts);
	},
	stashPop: (projectId: string, index?: number): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stashPop", projectId, index);
	},
	stashApply: (projectId: string, index?: number): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stashApply", projectId, index);
	},
	stashList: (projectId: string): Promise<StashEntry[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stashList", projectId);
	},
	stashDrop: (projectId: string, index?: number): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:stashDrop", projectId, index);
	},
	listTags: (projectId: string): Promise<string[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:listTags", projectId);
	},
	createTag: (
		projectId: string,
		name: string,
		opts?: { message?: string; ref?: string; sign?: boolean }
	): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:createTag", projectId, name, opts);
	},
	deleteTag: (projectId: string, name: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:deleteTag", projectId, name);
	},
	rebase: (projectId: string, opts: { onto: string }): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:rebase", projectId, opts);
	},
	rebaseAbort: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:rebaseAbort", projectId);
	},
	rebaseContinue: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:rebaseContinue", projectId);
	},
	rebaseSkip: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:rebaseSkip", projectId);
	},
	cherryPick: (projectId: string, refs: string[]): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:cherryPick", projectId, refs);
	},
	cherryPickAbort: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:cherryPickAbort", projectId);
	},
	cherryPickContinue: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:cherryPickContinue", projectId);
	},
	getConflictFiles: (projectId: string): Promise<string[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getConflictFiles", projectId);
	},
	markResolved: (projectId: string, paths: string[]): Promise<void> => {
		validateProjectId(projectId);
		paths.forEach(validatePath);
		return ipcRenderer.invoke("repo:markResolved", projectId, paths);
	},
	getEffectiveConfig: (projectId: string): Promise<ConfigEntry[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:getEffectiveConfig", projectId);
	},
	setLocalConfig: (projectId: string, key: string, value: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:setLocalConfig", projectId, key, value);
	},
	testSigning: (projectId: string, key?: string): Promise<{ ok: boolean; message: string }> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:testSigning", projectId, key);
	},
	listWorktrees: (projectId: string): Promise<WorktreeInfo[]> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:listWorktrees", projectId);
	},
	addWorktree: (
		projectId: string,
		branch: string,
		options?: AddWorktreeOptions
	): Promise<AddWorktreeResult> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:addWorktree", projectId, branch, options);
	},
	removeWorktree: (projectId: string, worktreePath: string, force?: boolean): Promise<void> => {
		validateProjectId(projectId);
		validatePath(worktreePath);
		return ipcRenderer.invoke("repo:removeWorktree", projectId, worktreePath, force);
	},
	pruneWorktrees: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:pruneWorktrees", projectId);
	},
	watchProject: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:watchProject", projectId);
	},
	unwatchProject: (projectId: string): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("repo:unwatchProject", projectId);
	},
};

const settings = {
	getGlobal: (): Promise<AppSettings> => ipcRenderer.invoke("settings:getGlobal"),
	getGlobalWithKeys: (): Promise<AppSettings> => ipcRenderer.invoke("settings:getGlobalWithKeys"),
	setGlobal: (partial: Partial<AppSettings>): Promise<AppSettings> =>
		ipcRenderer.invoke("settings:setGlobal", partial),
	getProjectPrefs: (projectId: string): Promise<ProjectPrefs | null> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("settings:getProjectPrefs", projectId);
	},
	setProjectPrefs: (projectId: string, prefs: Partial<ProjectPrefs>): Promise<void> => {
		validateProjectId(projectId);
		return ipcRenderer.invoke("settings:setProjectPrefs", projectId, prefs);
	},
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
	): Promise<{ success: boolean; models: string[]; error?: string }> => {
		if (baseURL !== undefined && baseURL !== "" && baseURL !== null) {
			validateUrl(baseURL);
		}
		return ipcRenderer.invoke("settings:fetchModels", type, apiKey, baseURL);
	},
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
	onOpenRepo: (callback: (payload: { projectId: string; worktreePath?: string }) => void) => {
		const handler = (
			_: Electron.IpcRendererEvent,
			payload: { projectId: string; worktreePath?: string }
		) => {
			callback(payload);
		};
		ipcRenderer.on(EVENT_OPEN_REPO, handler);
		return () => ipcRenderer.removeListener(EVENT_OPEN_REPO, handler);
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
	openExternal: (url: string): Promise<void> => {
		validateUrl(url);
		return ipcRenderer.invoke("app:openExternal", url);
	},
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
