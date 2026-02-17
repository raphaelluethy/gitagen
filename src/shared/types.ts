/** Git change type: Modified, Added, Deleted, Renamed, Copied, or Untracked */
export type GitChangeType = "M" | "A" | "D" | "R" | "C" | "?";

export interface GitFileStatus {
	path: string;
	status: "staged" | "unstaged" | "untracked";
	/** Git change type: M, A, D, R, C, ? */
	changeType?: GitChangeType;
	/** For renames: previous path */
	from?: string;
}

export interface FileChange {
	path: string;
	changeType: GitChangeType;
}

export interface GitStatus {
	repoPath: string;
	staged: GitFileStatus[];
	unstaged: GitFileStatus[];
	untracked: GitFileStatus[];
}

export type IpcChannel =
	| "projects:list"
	| "projects:listGrouped"
	| "projects:add"
	| "projects:remove"
	| "projects:switchTo"
	| "repo:openProject"
	| "repo:getTree"
	| "repo:getStatus"
	| "repo:getPatch"
	| "repo:getAllDiffs"
	| "repo:openInEditor"
	| "repo:refresh"
	| "repo:stageFiles"
	| "repo:unstageFiles"
	| "repo:stageAll"
	| "repo:unstageAll"
	| "repo:discardFiles"
	| "repo:discardAllUnstaged"
	| "repo:deleteUntrackedFiles"
	| "repo:discardAll"
	| "repo:commit"
	| "repo:undoLastCommit"
	| "repo:getUnpushedOids"
	| "repo:generateCommitMessage"
	| "repo:getLog"
	| "repo:getCachedLog"
	| "repo:getCommitDetail"
	| "repo:listBranches"
	| "repo:createBranch"
	| "repo:switchBranch"
	| "repo:deleteBranch"
	| "repo:renameBranch"
	| "repo:mergeBranch"
	| "repo:fetch"
	| "repo:pull"
	| "repo:push"
	| "repo:listRemotes"
	| "repo:addRemote"
	| "repo:removeRemote"
	| "repo:stash"
	| "repo:stashPop"
	| "repo:stashApply"
	| "repo:stashList"
	| "repo:stashDrop"
	| "repo:stashShow"
	| "repo:listTags"
	| "repo:createTag"
	| "repo:deleteTag"
	| "repo:rebase"
	| "repo:rebaseAbort"
	| "repo:rebaseContinue"
	| "repo:rebaseSkip"
	| "repo:cherryPick"
	| "repo:cherryPickAbort"
	| "repo:cherryPickContinue"
	| "repo:getConflictFiles"
	| "repo:markResolved"
	| "repo:getEffectiveConfig"
	| "repo:setLocalConfig"
	| "repo:testSigning"
	| "repo:listWorktrees"
	| "repo:addWorktree"
	| "repo:removeWorktree"
	| "repo:pruneWorktrees"
	| "settings:getGlobal"
	| "settings:getGlobalWithKeys"
	| "settings:setGlobal"
	| "settings:getProjectPrefs"
	| "settings:setProjectPrefs"
	| "settings:discoverGitBinaries"
	| "settings:getSshAgentInfo"
	| "settings:selectGitBinary"
	| "settings:selectFolder"
	| "settings:fetchModels"
	| "settings:listAIProviders"
	| "app:openExternal"
	| "app:confirm"
	| "events:repoUpdated"
	| "events:repoError"
	| "events:conflictDetected"
	| "events:openRepo"
	| "ai:commitChunk";

export type DiffStyle = "unified" | "split";

// --- Plan v1 types ---

export type FontFamily = "geist" | "geist-pixel" | "system" | (string & {});

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
	devMode: boolean;
	autoExpandSingleFolder: boolean;
	showWorktreePanel: boolean;
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

/** Project with worktree grouping: parentProjectId when this project is a worktree of another; worktreeChildren when this project has worktrees in the list */
export interface GroupedProject extends Project {
	parentProjectId?: string;
	worktreeChildren?: Project[];
}

export interface WorktreeInfo {
	path: string;
	branch: string;
	head: string;
	isMainWorktree: boolean;
	name?: string;
}

export interface AddWorktreeOptions {
	newBranch?: string;
	copyGitIgnores?: boolean;
}

export interface AddWorktreeResult {
	path: string;
	copiedGitignoreCount: number;
	copyGitignoreError?: string;
}

export interface ConfirmDialogOptions {
	title?: string;
	message: string;
	detail?: string;
	confirmLabel?: string;
	cancelLabel?: string;
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
	/** Whether this commit has been pushed to the upstream. undefined = unknown. false when no upstream. */
	pushed?: boolean;
}

export interface CommitDetail extends CommitInfo {
	body: string;
	patch: string;
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

export interface StashDetail {
	index: number;
	message: string;
	oid: string;
	branch: string;
	author: { name: string; email: string };
	date: string;
	patch: string;
}

export interface RemoteInfo {
	name: string;
	url: string;
	pushUrl?: string;
}

/** Bundled response from repo:openProject - status, branches, remotes, cachedLog, prefs in one IPC call */
export interface ProjectOpenData {
	status: RepoStatus | null;
	branches: BranchInfo[];
	remotes: RemoteInfo[];
	cachedLog: CommitInfo[] | null;
	/** Cached unpushed OIDs for annotating cachedLog with pushed status */
	cachedUnpushedOids: string[] | null;
	prefs: ProjectPrefs | null;
}

/** Summary returned from fetch for toast display */
export interface FetchResultSummary {
	branchesUpdated: number;
	tagsUpdated: number;
	refsDeleted: number;
	newBranchRefs: string[];
}

/** Summary returned from pull for toast display */
export interface PullResultSummary {
	commitsPulled: number;
	filesChanged: number;
	insertions: number;
	deletions: number;
}

/** Summary returned from push for toast display */
export interface PushResultSummary {
	commitsPushed: number;
	refsPushed: number;
	branch?: string;
}

export interface ConfigEntry {
	key: string;
	value: string;
	origin: string;
	scope: "system" | "global" | "local" | "worktree" | "unknown";
}

// --- AI Provider Types ---

export type AIProviderType =
	| "openai"
	| "anthropic"
	| "openrouter"
	| "cerebras"
	| "fireworks"
	| (string & {});

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

export interface CliStatus {
	installed: boolean;
	path: string | null;
	needsUpdate: boolean;
}
