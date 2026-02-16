import { copyFile, mkdir, readdir } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { dirname, join, relative } from "path";
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

async function copyGitignoreFiles(sourceRoot: string, targetRoot: string): Promise<number> {
	if (!existsSync(sourceRoot)) return 0;
	const dirs: string[] = [sourceRoot];
	let copiedCount = 0;

	while (dirs.length > 0) {
		const dir = dirs.pop();
		if (!dir) continue;
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".git") continue;
			const absolutePath = join(dir, entry.name);
			if (entry.isDirectory()) {
				dirs.push(absolutePath);
				continue;
			}

			if (entry.name !== ".gitignore") continue;
			const relPath = relative(sourceRoot, absolutePath);
			if (relPath.startsWith("..")) continue;
			const targetPath = join(targetRoot, relPath);
			await mkdir(dirname(targetPath), { recursive: true });
			await copyFile(absolutePath, targetPath);
			copiedCount += 1;
		}
	}

	return copiedCount;
}

interface AddWorktreeManagerOptions {
	newBranch?: string;
	copyGitIgnores?: boolean;
	sourceWorktreePath?: string;
}

interface AddWorktreeManagerResult {
	worktreePath: string;
	copiedGitignoreCount: number;
	copyGitignoreError?: string;
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
	options?: AddWorktreeManagerOptions,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>
): Promise<AddWorktreeManagerResult> {
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
	await provider.addWorktree(repoPath, worktreePath, branch, options?.newBranch);

	let copiedGitignoreCount = 0;
	let copyGitignoreError: string | undefined;
	if (options?.copyGitIgnores) {
		const sourcePath = options.sourceWorktreePath ?? repoPath;
		try {
			copiedGitignoreCount = await copyGitignoreFiles(sourcePath, worktreePath);
		} catch (error) {
			copyGitignoreError =
				error instanceof Error ? error.message : "Failed to copy .gitignore files.";
		}
	}

	return {
		worktreePath,
		copiedGitignoreCount,
		copyGitignoreError,
	};
}

export async function removeWorktree(
	repoPath: string,
	worktreePath: string,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>,
	force?: boolean
): Promise<void> {
	const provider = gitProvider ?? createSimpleGitProvider();
	await provider.removeWorktree(repoPath, worktreePath, force);
}

export async function pruneWorktrees(
	repoPath: string,
	gitProvider?: ReturnType<typeof createSimpleGitProvider>
): Promise<void> {
	const provider = gitProvider ?? createSimpleGitProvider();
	await provider.pruneWorktrees(repoPath);
}
