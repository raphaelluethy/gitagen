import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createSimpleGitProvider } from "../git/simple-git-provider.js";
import { generateWorktreeName } from "./naming.js";
import type { WorktreeInfo as SharedWorktreeInfo } from "../../../shared/types.js";

const GITAGEN_DIR = join(homedir(), ".gitagen");

function getProjectWorktreeDir(projectName: string): string {
	return join(GITAGEN_DIR, projectName);
}

function sanitizeProjectName(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "repo";
}

export function listWorktrees(
	repoPath: string,
	gitProvider: ReturnType<typeof createSimpleGitProvider>
): Promise<SharedWorktreeInfo[]> {
	return gitProvider.listWorktrees(repoPath).then((list) =>
		list.map((w) => {
			const name = w.path.split("/").pop() ?? generateWorktreeName();
			return {
				path: w.path,
				branch: w.branch,
				head: w.head,
				isMainWorktree: w.isMainWorktree,
				name,
			};
		})
	);
}

export async function addWorktree(
	repoPath: string,
	projectName: string,
	branch: string,
	newBranch?: string,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>
): Promise<string> {
	const provider = gitProvider ?? createSimpleGitProvider();
	const baseDir = getProjectWorktreeDir(sanitizeProjectName(projectName));
	if (!existsSync(baseDir)) {
		mkdirSync(baseDir, { recursive: true });
	}
	let name = generateWorktreeName();
	let worktreePath = join(baseDir, name);
	while (existsSync(worktreePath)) {
		name = generateWorktreeName();
		worktreePath = join(baseDir, name);
	}
	await provider.addWorktree(repoPath, worktreePath, branch, newBranch);
	return worktreePath;
}

export async function removeWorktree(
	repoPath: string,
	worktreePath: string,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>
): Promise<void> {
	const provider = gitProvider ?? createSimpleGitProvider();
	await provider.removeWorktree(repoPath, worktreePath);
}

export async function pruneWorktrees(
	repoPath: string,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>
): Promise<void> {
	const provider = gitProvider ?? createSimpleGitProvider();
	await provider.pruneWorktrees(repoPath);
}
