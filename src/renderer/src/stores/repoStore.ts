import { create } from "zustand";
import type {
	RepoStatus,
	GitStatus,
	GitFileStatus,
	BranchInfo,
	RemoteInfo,
	CommitInfo,
} from "../../../shared/types";
import { useProjectStore } from "./projectStore";
import { useUIStore } from "./uiStore";

function repoStatusToGitFileStatus(
	status: RepoStatus,
	type: "staged" | "unstaged" | "untracked"
): GitFileStatus[] {
	const items =
		type === "staged"
			? status.staged
			: type === "unstaged"
				? status.unstaged
				: status.untracked;
	return items.map((item) => ({
		path: typeof item === "string" ? item : item.path,
		status: type,
		changeType: typeof item === "string" ? "M" : item.changeType,
	}));
}

export function selectGitStatus(
	status: RepoStatus | null,
	repoPath: string | undefined
): GitStatus | null {
	if (!repoPath || !status) return null;
	return {
		repoPath,
		staged: repoStatusToGitFileStatus(status, "staged"),
		unstaged: repoStatusToGitFileStatus(status, "unstaged"),
		untracked: repoStatusToGitFileStatus(status, "untracked"),
	};
}

interface CachedLog {
	projectId: string;
	commits: CommitInfo[];
	unpushedOids: string[] | null;
}

interface RepoState {
	status: RepoStatus | null;
	currentBranchInfo: BranchInfo | null;
	remotes: RemoteInfo[];
	activeWorktreePath: string | null;
	cachedLog: CachedLog | null;
	selectedFile: GitFileStatus | null;
	refreshKey: number;

	openProject: (projectId: string) => Promise<void>;
	refreshStatus: () => Promise<void>;
	triggerRefresh: () => void;
	clearState: () => void;
	setSelectedFile: (file: GitFileStatus | null) => void;
	setSelectedFileAndClearCommit: (file: GitFileStatus | null) => void;
	setStatus: (status: RepoStatus | null) => void;
	setBranchInfo: (info: BranchInfo | null) => void;
	setRemotes: (remotes: RemoteInfo[]) => void;
	setWorktreePath: (path: string | null) => void;
	setCachedLog: (log: CachedLog | null) => void;
	syncSelectedFileWithStatus: () => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
	status: null,
	currentBranchInfo: null,
	remotes: [],
	activeWorktreePath: null,
	cachedLog: null,
	selectedFile: null,
	refreshKey: 0,

	clearState: () =>
		set({
			status: null,
			currentBranchInfo: null,
			remotes: [],
			activeWorktreePath: null,
			cachedLog: null,
			selectedFile: null,
		}),

	setSelectedFile: (file) => set({ selectedFile: file }),
	setSelectedFileAndClearCommit: (file: GitFileStatus | null) => {
		set({ selectedFile: file });
		useUIStore.getState().setSelectedCommitOid(null);
	},
	setStatus: (status) => {
		set({ status });
		get().syncSelectedFileWithStatus();
	},
	setBranchInfo: (info) => set({ currentBranchInfo: info }),
	setRemotes: (remotes) => set({ remotes }),
	setWorktreePath: (path) => set({ activeWorktreePath: path }),
	setCachedLog: (log) => set({ cachedLog: log }),

	triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

	refreshStatus: async () => {
		const activeProject = useProjectStore.getState().activeProject;
		if (!activeProject) return;
		const status = await window.gitagen.repo.getStatus(activeProject.id);
		if (status) {
			set({ status });
			get().syncSelectedFileWithStatus();
		}
	},

	openProject: async (projectId) => {
		useProjectStore.getState().setProjectLoading(true);
		get().clearState();
		try {
			const data = await window.gitagen.repo.openProject(projectId);
			if (!data) return;
			const branchInfo = data.branches.find((b) => b.current) ?? null;
			set({
				status: data.status,
				currentBranchInfo: branchInfo,
				remotes: data.remotes,
				activeWorktreePath: data.prefs?.activeWorktreePath ?? null,
				cachedLog:
					data.cachedLog && data.cachedLog.length > 0
						? {
								projectId,
								commits: data.cachedLog,
								unpushedOids: data.cachedUnpushedOids,
							}
						: null,
			});
			get().syncSelectedFileWithStatus();
		} catch (error) {
			console.error("[repoStore] openProject failed:", error);
		} finally {
			useProjectStore.getState().setProjectLoading(false);
		}
	},

	syncSelectedFileWithStatus: () => {
		const { status, selectedFile } = get();
		if (!selectedFile || !status) return;
		const lookup = (
			items: RepoStatus["staged"] | RepoStatus["unstaged"] | RepoStatus["untracked"],
			type: "staged" | "unstaged" | "untracked"
		) => {
			for (const item of items) {
				const path = typeof item === "string" ? item : item.path;
				if (path === selectedFile.path) return type;
			}
			return null;
		};
		const newStatus =
			lookup(status.staged, "staged") ??
			lookup(status.unstaged, "unstaged") ??
			lookup(status.untracked, "untracked");
		if (newStatus && newStatus !== selectedFile.status) {
			set({ selectedFile: { ...selectedFile, status: newStatus } });
		}
	},
}));
