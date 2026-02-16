export interface GitFileStatus {
	path: string;
	status: "staged" | "unstaged" | "untracked";
	/** For renames: previous path */
	from?: string;
}

export interface GitStatus {
	repoPath: string;
	staged: GitFileStatus[];
	unstaged: GitFileStatus[];
	untracked: GitFileStatus[];
}

export type IpcChannel = "git:getStatus" | "git:getFileDiff" | "git:getStagedFileDiff";

export type DiffStyle = "unified" | "split";
