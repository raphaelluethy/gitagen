export interface GitFileStatus {
	path: string;
	status: "staged" | "unstaged" | "untracked";
	/** Git change type: M, A, D, R, C, ? */
	changeType?: string;
	/** For renames: previous path */
	from?: string;
}

export interface FileChange {
	path: string;
	changeType: string; // M, A, D, R, C, ?
}

export interface GitStatus {
	repoPath: string;
	staged: GitFileStatus[];
	unstaged: GitFileStatus[];
	untracked: GitFileStatus[];
}

export type IpcChannel =
	| "git:getStatus"
	| "git:getFileDiff"
	| "git:getStagedFileDiff"
	| "projects:list"
	| "projects:add"
	| "projects:remove"
	| "projects:switchTo"
	| "repo:*"
	| "settings:*"
	| "events:*";

export type DiffStyle = "unified" | "split";

// --- Plan v1 types ---

export type FontFamily = "geist" | "geist-pixel" | "system";

export interface AppSettings {
	gitBinaryPath: string | null;
	theme: "dark" | "light" | "system";
	signing: {
		enabled: boolean;
		key: string;
	};
	ai: AISettings;
	uiScale: number;
	fontSize: number;
	commitMessageFontSize: number;
	fontFamily: FontFamily;
	gpuAcceleration: boolean;
}

export interface Project {
	id: string;
	name: string;
	path: string;
	lastOpenedAt: number;
	createdAt: number;
	worktrees?: WorktreeInfo[];
	activeWorktreePath?: string;
}

export interface WorktreeInfo {
	path: string;
	branch: string;
	head: string;
	isMainWorktree: boolean;
	name: string;
}

export interface TreeNode {
	path: string;
	name: string;
	kind: "file" | "dir";
	depth: number;
	hasChildren: boolean;
	gitStatus?: string;
}

export interface RepoStatus {
	headOid: string;
	branch: string;
	staged: FileChange[];
	unstaged: FileChange[];
	untracked: FileChange[];
}

export interface PatchResult {
	filePath: string;
	scope: "staged" | "unstaged";
	patch: string;
	fromCache: boolean;
	fingerprint: string;
}

export interface ProjectPrefs {
	includeIgnored: boolean;
	changedOnly: boolean;
	expandedDirs: string[];
	selectedFilePath: string | null;
	sidebarScrollTop: number;
	activeWorktreePath: string | null;
}

export interface CommitInfo {
	oid: string;
	message: string;
	author: { name: string; email: string; date: string };
	parents: string[];
	signed: boolean;
}

export interface BranchInfo {
	name: string;
	current: boolean;
	tracking?: string;
	ahead: number;
	behind: number;
}

export interface ConflictState {
	type: "merge" | "rebase" | "cherry-pick";
	conflictFiles: string[];
	currentStep?: number;
	totalSteps?: number;
}

export interface CommitResult {
	oid: string;
	signed: boolean;
}

export interface StashEntry {
	index: number;
	message: string;
	oid: string;
}

export interface RemoteInfo {
	name: string;
	url: string;
	pushUrl?: string;
}

export interface ConfigEntry {
	key: string;
	value: string;
	origin: string;
	scope: "system" | "global" | "local" | "worktree";
}

// --- AI Provider Types ---

export type AIProviderType = string;

export interface AIProviderDescriptor {
	id: AIProviderType;
	displayName: string;
	requiresBaseURL: boolean;
}

export interface AIProviderInstance {
	id: string;
	name: string;
	type: AIProviderType;
	enabled: boolean;
	apiKey: string;
	baseURL?: string;
	defaultModel: string;
	models: string[];
}

export type CommitStyle = "conventional" | "emoji" | "descriptive" | "imperative";

export interface AISettings {
	activeProviderId: string | null;
	providers: AIProviderInstance[];
	commitStyle: CommitStyle;
}
