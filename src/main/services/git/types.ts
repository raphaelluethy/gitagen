import type {
	BranchInfo,
	CommitDetail,
	CommitInfo,
	FetchResultSummary,
	PullResultSummary,
	PushResultSummary,
	RepoStatus,
	RemoteInfo,
	StashDetail,
	StashEntry,
	TreeNode,
	WorktreeInfo,
} from "../../../shared/types.js";

export interface RepoFingerprint {
	repoPath: string;
	headOid: string;
	indexMtimeMs: number;
	headMtimeMs: number;
	statusHash: string;
}

export interface GetTreeOptions {
	includeIgnored?: boolean;
	changedOnly?: boolean;
	cwd: string;
}

export interface GetPatchOptions {
	cwd: string;
	filePath: string;
	scope: "staged" | "unstaged" | "untracked";
}

export interface GitProvider {
	getTree(options: GetTreeOptions): Promise<TreeNode[]>;
	getStatus(cwd: string): Promise<RepoStatus | null>;
	/** Returns the top-level directory of the repo; same as cwd if not a worktree. Returns null on error. */
	getToplevel(cwd: string): Promise<string | null>;
	getPatch(options: GetPatchOptions): Promise<string | null>;
	getHeadOid(cwd: string): Promise<string | null>;
	getRepoFingerprint(cwd: string): Promise<RepoFingerprint | null>;

	stageFiles(cwd: string, paths: string[]): Promise<void>;
	unstageFiles(cwd: string, paths: string[]): Promise<void>;
	stageAll(cwd: string): Promise<void>;
	unstageAll(cwd: string): Promise<void>;
	discardFiles(cwd: string, paths: string[]): Promise<void>;
	discardAllUnstaged(cwd: string): Promise<void>;
	deleteUntrackedFiles(cwd: string, paths: string[]): Promise<void>;
	discardAll(cwd: string): Promise<void>;

	commit(
		cwd: string,
		opts: { message: string; amend?: boolean; sign?: boolean }
	): Promise<{ oid: string; signed: boolean }>;
	getLog(
		cwd: string,
		opts?: { limit?: number; branch?: string; offset?: number }
	): Promise<CommitInfo[]>;
	getCommitDetail(cwd: string, oid: string): Promise<CommitDetail | null>;

	/** Returns OIDs of unpushed commits, or null if no upstream tracking branch exists. */
	getUnpushedOids(cwd: string): Promise<string[] | null>;

	/** Soft-reset the last commit, keeping changes staged. */
	undoLastCommit(cwd: string): Promise<void>;

	listBranches(cwd: string): Promise<BranchInfo[]>;
	createBranch(cwd: string, name: string, startPoint?: string): Promise<void>;
	switchBranch(cwd: string, name: string): Promise<void>;
	deleteBranch(cwd: string, name: string, force?: boolean): Promise<void>;
	renameBranch(cwd: string, oldName: string, newName: string): Promise<void>;
	mergeBranch(
		cwd: string,
		source: string,
		opts?: { noFf?: boolean; squash?: boolean; message?: string }
	): Promise<void>;

	fetch(cwd: string, opts?: { remote?: string; prune?: boolean }): Promise<FetchResultSummary>;
	pull(
		cwd: string,
		opts?: {
			remote?: string;
			branch?: string;
			rebase?: boolean;
			behind?: number;
		}
	): Promise<PullResultSummary>;
	push(
		cwd: string,
		opts?: {
			remote?: string;
			branch?: string;
			force?: boolean;
			setUpstream?: boolean;
			ahead?: number;
		}
	): Promise<PushResultSummary>;
	listRemotes(cwd: string): Promise<RemoteInfo[]>;
	addRemote(cwd: string, name: string, url: string): Promise<void>;
	removeRemote(cwd: string, name: string): Promise<void>;

	stash(cwd: string, opts?: { message?: string; includeUntracked?: boolean }): Promise<void>;
	stashPop(cwd: string, index?: number): Promise<void>;
	stashApply(cwd: string, index?: number): Promise<void>;
	stashList(cwd: string): Promise<StashEntry[]>;
	stashDrop(cwd: string, index?: number): Promise<void>;
	stashShow(cwd: string, index: number): Promise<StashDetail | null>;

	listTags(cwd: string): Promise<string[]>;
	createTag(
		cwd: string,
		name: string,
		opts?: { message?: string; ref?: string; sign?: boolean }
	): Promise<void>;
	deleteTag(cwd: string, name: string): Promise<void>;

	rebase(cwd: string, opts: { onto: string }): Promise<void>;
	rebaseAbort(cwd: string): Promise<void>;
	rebaseContinue(cwd: string): Promise<void>;
	rebaseSkip(cwd: string): Promise<void>;

	cherryPick(cwd: string, refs: string[]): Promise<void>;
	cherryPickAbort(cwd: string): Promise<void>;
	cherryPickContinue(cwd: string): Promise<void>;

	getConflictFiles(cwd: string): Promise<string[]>;
	markResolved(cwd: string, paths: string[]): Promise<void>;

	listWorktrees(cwd: string): Promise<WorktreeInfo[]>;
	addWorktree(
		repoPath: string,
		worktreePath: string,
		branch: string,
		newBranch?: string
	): Promise<void>;
	removeWorktree(repoPath: string, worktreePath: string, force?: boolean): Promise<void>;
	pruneWorktrees(repoPath: string): Promise<void>;
}
