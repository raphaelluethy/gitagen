import { readFileSync } from "fs";
import { join } from "path";
import simpleGit, { SimpleGit, StatusResult } from "simple-git";
import type { GitFileStatus, GitStatus } from "../shared/types.js";

function getRepoPath(git: SimpleGit): Promise<string> {
	return git.revparse(["--show-toplevel"]) as Promise<string>;
}

function statusToGitStatus(repoPath: string, status: StatusResult): GitStatus {
	const staged: GitFileStatus[] = [];
	const unstaged: GitFileStatus[] = [];
	const untracked: GitFileStatus[] = [];

	for (const f of status.files) {
		const path = f.path;
		const hasStaged = f.index !== " " && f.index !== "?";
		const hasUnstaged = f.working_dir !== " " && f.working_dir !== "?";

		if (f.index === "?" && f.working_dir === "?") {
			untracked.push({ path, status: "untracked" });
		} else {
			if (hasStaged) {
				staged.push({
					path,
					status: "staged",
					from: f.from,
				});
			}
			if (hasUnstaged) {
				unstaged.push({
					path,
					status: "unstaged",
					from: f.from,
				});
			}
		}
	}

	for (const path of status.not_added) {
		if (!untracked.some((f) => f.path === path)) {
			untracked.push({ path, status: "untracked" });
		}
	}

	return { repoPath, staged, unstaged, untracked };
}

export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
	try {
		const git = simpleGit(cwd);
		const [repoPath, status] = await Promise.all([getRepoPath(git), git.status()]);
		return statusToGitStatus(repoPath.trim(), status);
	} catch {
		return null;
	}
}

export type DiffMode = "staged" | "unstaged" | "untracked";

export async function getFileDiff(
	cwd: string,
	filePath: string,
	mode: DiffMode
): Promise<string | null> {
	try {
		const git = simpleGit(cwd);

		if (mode === "untracked") {
			const diff = await getUntrackedFileDiff(cwd, filePath);
			return diff;
		}

		const args = mode === "staged" ? ["--cached", "--", filePath] : ["--", filePath];
		const diff = await git.diff(args);
		return diff;
	} catch {
		return null;
	}
}

/** Produces a unified diff showing the whole file as added (for new/untracked files). */
async function getUntrackedFileDiff(repoPath: string, filePath: string): Promise<string | null> {
	try {
		const git = simpleGit(repoPath);
		const diff = await git.diff(["--no-index", "/dev/null", filePath]);
		return diff;
	} catch {
		return buildNewFileDiff(repoPath, filePath);
	}
}

/** Fallback: build a "new file" diff from file content (e.g. when /dev/null not available on Windows). */
function buildNewFileDiff(repoPath: string, filePath: string): string | null {
	try {
		const fullPath = join(repoPath, filePath);
		const content = readFileSync(fullPath, "utf-8");

		if (content.includes("\0")) {
			return null;
		}

		const lines = content.split(/\r?\n/);
		const addCount = lines.length;
		const diffLines = lines.map((line) => `+${line}`).join("\n");
		const eof = content.endsWith("\n") ? "" : "\n";
		return `diff --git a/${filePath} b/${filePath}
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${addCount} @@
${diffLines}${eof}`;
	} catch {
		return null;
	}
}
