import { ipcMain, shell } from "electron";
import { generateCommitMessage } from "../services/ai/commit-message.js";
import { join } from "path";
import { createGitProvider } from "../services/git/index.js";
import type { GitProvider } from "../services/git/types.js";
import { getAppSettings } from "../services/settings/store.js";
import {
	getProject,
	getProjectPrefs,
	getRepoCache,
	setRepoCache,
	getPatchCache,
	setPatchCache,
	invalidateProjectCache,
} from "../services/cache/queries.js";
import {
	listWorktrees as listWorktreesManager,
	addWorktree as addWorktreeManager,
	removeWorktree as removeWorktreeManager,
	pruneWorktrees as pruneWorktreesManager,
} from "../services/worktree/manager.js";
import { emitConflictDetected, emitRepoError, emitRepoUpdated } from "./events.js";
import type { ConflictState, FileChange, RepoStatus, TreeNode } from "../../shared/types.js";

function migrateRepoStatus(raw: unknown): RepoStatus | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const headOid = typeof r.headOid === "string" ? r.headOid : "";
	const branch = typeof r.branch === "string" ? r.branch : "";
	const toFileChanges = (arr: unknown): FileChange[] => {
		if (!Array.isArray(arr)) return [];
		return arr
			.map((item) =>
				typeof item === "string"
					? { path: item, changeType: "M" }
					: item && typeof item === "object" && "path" in (item as object)
						? {
								path: String((item as { path: unknown }).path),
								changeType: String(
									(item as { changeType?: unknown }).changeType ?? "M"
								),
							}
						: null
			)
			.filter((x): x is FileChange => x !== null);
	};
	return {
		headOid,
		branch,
		staged: toFileChanges(r.staged),
		unstaged: toFileChanges(r.unstaged),
		untracked: toFileChanges(r.untracked),
	};
}

function getRepoPath(projectId: string): string | null {
	const project = getProject(projectId);
	if (!project) return null;
	const prefs = getProjectPrefs(projectId);
	const activePath = prefs?.active_worktree_path;
	return activePath && activePath.trim() !== "" ? activePath : project.path;
}

function getGitProvider(): GitProvider {
	const settings = getAppSettings();
	return createGitProvider(settings);
}

function buildFingerprintKeyValue(fingerprint: {
	repoPath: string;
	headOid: string;
	indexMtimeMs: number;
	headMtimeMs: number;
	statusHash: string;
}): string {
	return [
		fingerprint.repoPath,
		fingerprint.headOid,
		String(fingerprint.indexMtimeMs),
		String(fingerprint.headMtimeMs),
		fingerprint.statusHash,
	].join("|");
}

async function getBaseFingerprintKey(git: GitProvider, cwd: string): Promise<string | null> {
	const fingerprint = await git.getRepoFingerprint(cwd);
	if (!fingerprint) return null;
	return buildFingerprintKeyValue(fingerprint);
}

function parseJsonSafe<T>(value: string | null): T | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function setRepoCacheSafe(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean,
	treeData: string | null,
	statusData: string | null
): void {
	try {
		setRepoCache(projectId, fingerprint, includeIgnored, treeData, statusData);
	} catch {
		// Cache writes are best-effort and must never block live git responses.
	}
}

function setPatchCacheSafe(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string,
	patchText: string
): void {
	try {
		setPatchCache(projectId, filePath, scope, fingerprint, patchText);
	} catch {
		// Cache writes are best-effort and must never block live git responses.
	}
}

function invalidateAndEmit(projectId: string): void {
	invalidateProjectCache(projectId);
	emitRepoUpdated(projectId);
}

function shouldForceRemoveWorktree(error: unknown): boolean {
	if (!error) return false;
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("contains modified or untracked files");
}

async function emitConflictsIfAny(projectId: string, git: GitProvider, cwd: string): Promise<void> {
	try {
		const conflictFiles = await git.getConflictFiles(cwd);
		if (conflictFiles.length === 0) return;
		const state: ConflictState = {
			type: "merge",
			conflictFiles,
		};
		emitConflictDetected(projectId, state);
	} catch {
		// Ignore conflict probing errors.
	}
}

async function runMutation(
	projectId: string,
	action: (git: GitProvider, cwd: string) => Promise<void>,
	opts?: { emitConflicts?: boolean }
): Promise<void> {
	const cwd = getRepoPath(projectId);
	if (!cwd) return;
	const git = getGitProvider();
	try {
		await action(git, cwd);
		invalidateAndEmit(projectId);
		if (opts?.emitConflicts) {
			await emitConflictsIfAny(projectId, git, cwd);
		}
	} catch (error) {
		emitRepoError(projectId, error);
		throw error;
	}
}

export function registerRepoHandlers(): void {
	ipcMain.handle(
		"repo:getTree",
		async (_, projectId: string, includeIgnored?: boolean, changedOnly?: boolean) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return [];
			const git = getGitProvider();
			const includeIgnoredFlag = Boolean(includeIgnored);
			const changedOnlyFlag = Boolean(changedOnly);
			try {
				const baseFingerprint = await getBaseFingerprintKey(git, cwd);
				const treeFingerprint = baseFingerprint
					? `${baseFingerprint}|tree:${changedOnlyFlag ? "1" : "0"}`
					: null;
				if (treeFingerprint) {
					const cached = getRepoCache(projectId, treeFingerprint, includeIgnoredFlag);
					const cachedTree = parseJsonSafe<TreeNode[]>(cached?.tree_data ?? null);
					if (cachedTree) return cachedTree;
				}

				const tree = await git.getTree({
					cwd,
					includeIgnored: includeIgnoredFlag,
					changedOnly: changedOnlyFlag,
				});
				if (treeFingerprint) {
					setRepoCacheSafe(
						projectId,
						treeFingerprint,
						includeIgnoredFlag,
						JSON.stringify(tree),
						null
					);
				}
				return tree;
			} catch (error) {
				emitRepoError(projectId, error);
				return [];
			}
		}
	);

	ipcMain.handle("repo:getStatus", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return null;
		const git = getGitProvider();
		try {
			const baseFingerprint = await getBaseFingerprintKey(git, cwd);
			if (baseFingerprint) {
				const cached = getRepoCache(projectId, baseFingerprint, false);
				const raw = parseJsonSafe<unknown>(cached?.status_data ?? null);
				const cachedStatus = raw ? migrateRepoStatus(raw) : null;
				if (cachedStatus) return cachedStatus;
			}

			const status = await git.getStatus(cwd);
			if (baseFingerprint && status) {
				setRepoCacheSafe(projectId, baseFingerprint, false, null, JSON.stringify(status));
			}
			return status;
		} catch (error) {
			emitRepoError(projectId, error);
			return null;
		}
	});

	ipcMain.handle(
		"repo:getPatch",
		async (
			_,
			projectId: string,
			filePath: string,
			scope: "staged" | "unstaged" | "untracked"
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return null;
			const git = getGitProvider();
			try {
				const baseFingerprint = await getBaseFingerprintKey(git, cwd);
				const patchFingerprint = baseFingerprint ? `${baseFingerprint}|patch` : null;
				if (patchFingerprint) {
					const cached = getPatchCache(projectId, filePath, scope, patchFingerprint);
					if (cached != null) return cached;
				}

				const patch = await git.getPatch({ cwd, filePath, scope });
				if (patchFingerprint && patch != null) {
					setPatchCacheSafe(projectId, filePath, scope, patchFingerprint, patch);
				}
				return patch;
			} catch (error) {
				emitRepoError(projectId, error);
				return null;
			}
		}
	);

	ipcMain.handle("repo:refresh", async (_, projectId: string) => {
		invalidateAndEmit(projectId);
	});

	// Staging
	ipcMain.handle("repo:stageFiles", async (_, projectId: string, paths: string[]) => {
		await runMutation(projectId, (git, cwd) => git.stageFiles(cwd, paths));
	});

	ipcMain.handle("repo:unstageFiles", async (_, projectId: string, paths: string[]) => {
		await runMutation(projectId, (git, cwd) => git.unstageFiles(cwd, paths));
	});

	ipcMain.handle("repo:stageAll", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.stageAll(cwd));
	});

	ipcMain.handle("repo:unstageAll", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.unstageAll(cwd));
	});

	ipcMain.handle("repo:discardFiles", async (_, projectId: string, paths: string[]) => {
		await runMutation(projectId, (git, cwd) => git.discardFiles(cwd, paths));
	});

	ipcMain.handle("repo:discardAllUnstaged", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.discardAllUnstaged(cwd));
	});

	ipcMain.handle(
		"repo:openInEditor",
		async (_, projectId: string, filePath: string): Promise<void> => {
			const cwd = getRepoPath(projectId);
			if (!cwd) throw new Error("Project not found");
			const fullPath = join(cwd, filePath);
			await shell.openPath(fullPath);
		}
	);

	// Commit
	ipcMain.handle(
		"repo:commit",
		async (
			_,
			projectId: string,
			message: string,
			opts?: { amend?: boolean; sign?: boolean }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) throw new Error("Project not found");
			const git = getGitProvider();
			try {
				const result = await git.commit(cwd, {
					message,
					amend: opts?.amend,
					sign: opts?.sign ?? getAppSettings().signing.enabled,
				});
				invalidateAndEmit(projectId);
				await emitConflictsIfAny(projectId, git, cwd);
				return result;
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle("repo:generateCommitMessage", async (event, projectId: string) => {
		return generateCommitMessage(projectId, event.sender);
	});

	ipcMain.handle(
		"repo:getLog",
		async (
			_,
			projectId: string,
			opts?: { limit?: number; branch?: string; offset?: number }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return [];
			try {
				return await getGitProvider().getLog(cwd, opts);
			} catch (error) {
				emitRepoError(projectId, error);
				return [];
			}
		}
	);

	// Branches
	ipcMain.handle("repo:listBranches", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return await getGitProvider().listBranches(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle(
		"repo:createBranch",
		async (_, projectId: string, name: string, startPoint?: string) => {
			await runMutation(projectId, (git, cwd) => git.createBranch(cwd, name, startPoint));
		}
	);

	ipcMain.handle("repo:switchBranch", async (_, projectId: string, name: string) => {
		await runMutation(projectId, (git, cwd) => git.switchBranch(cwd, name));
	});

	ipcMain.handle(
		"repo:deleteBranch",
		async (_, projectId: string, name: string, force?: boolean) => {
			await runMutation(projectId, (git, cwd) => git.deleteBranch(cwd, name, force));
		}
	);

	ipcMain.handle(
		"repo:renameBranch",
		async (_, projectId: string, oldName: string, newName: string) => {
			await runMutation(projectId, (git, cwd) => git.renameBranch(cwd, oldName, newName));
		}
	);

	ipcMain.handle(
		"repo:mergeBranch",
		async (
			_,
			projectId: string,
			source: string,
			opts?: { noFf?: boolean; squash?: boolean; message?: string }
		) => {
			await runMutation(projectId, (git, cwd) => git.mergeBranch(cwd, source, opts), {
				emitConflicts: true,
			});
		}
	);

	// Remotes
	ipcMain.handle(
		"repo:fetch",
		async (_, projectId: string, opts?: { remote?: string; prune?: boolean }) => {
			await runMutation(projectId, (git, cwd) => git.fetch(cwd, opts));
		}
	);

	ipcMain.handle(
		"repo:pull",
		async (
			_,
			projectId: string,
			opts?: { remote?: string; branch?: string; rebase?: boolean }
		) => {
			await runMutation(projectId, (git, cwd) => git.pull(cwd, opts), {
				emitConflicts: true,
			});
		}
	);

	ipcMain.handle(
		"repo:push",
		async (
			_,
			projectId: string,
			opts?: { remote?: string; branch?: string; force?: boolean; setUpstream?: boolean }
		) => {
			await runMutation(projectId, (git, cwd) => git.push(cwd, opts));
		}
	);

	ipcMain.handle("repo:listRemotes", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return await getGitProvider().listRemotes(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle("repo:addRemote", async (_, projectId: string, name: string, url: string) => {
		await runMutation(projectId, (git, cwd) => git.addRemote(cwd, name, url));
	});

	ipcMain.handle("repo:removeRemote", async (_, projectId: string, name: string) => {
		await runMutation(projectId, (git, cwd) => git.removeRemote(cwd, name));
	});

	// Stash
	ipcMain.handle(
		"repo:stash",
		async (_, projectId: string, opts?: { message?: string; includeUntracked?: boolean }) => {
			await runMutation(projectId, (git, cwd) => git.stash(cwd, opts));
		}
	);

	ipcMain.handle("repo:stashPop", async (_, projectId: string, index?: number) => {
		await runMutation(projectId, (git, cwd) => git.stashPop(cwd, index), {
			emitConflicts: true,
		});
	});

	ipcMain.handle("repo:stashApply", async (_, projectId: string, index?: number) => {
		await runMutation(projectId, (git, cwd) => git.stashApply(cwd, index), {
			emitConflicts: true,
		});
	});

	ipcMain.handle("repo:stashList", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return await getGitProvider().stashList(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle("repo:stashDrop", async (_, projectId: string, index?: number) => {
		await runMutation(projectId, (git, cwd) => git.stashDrop(cwd, index));
	});

	// Tags
	ipcMain.handle("repo:listTags", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return await getGitProvider().listTags(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle(
		"repo:createTag",
		async (
			_,
			projectId: string,
			name: string,
			opts?: { message?: string; ref?: string; sign?: boolean }
		) => {
			await runMutation(projectId, (git, cwd) => git.createTag(cwd, name, opts));
		}
	);

	ipcMain.handle("repo:deleteTag", async (_, projectId: string, name: string) => {
		await runMutation(projectId, (git, cwd) => git.deleteTag(cwd, name));
	});

	// Rebase
	ipcMain.handle("repo:rebase", async (_, projectId: string, opts: { onto: string }) => {
		await runMutation(projectId, (git, cwd) => git.rebase(cwd, opts), {
			emitConflicts: true,
		});
	});

	ipcMain.handle("repo:rebaseAbort", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.rebaseAbort(cwd));
	});

	ipcMain.handle("repo:rebaseContinue", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.rebaseContinue(cwd), {
			emitConflicts: true,
		});
	});

	ipcMain.handle("repo:rebaseSkip", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.rebaseSkip(cwd), {
			emitConflicts: true,
		});
	});

	// Cherry-pick
	ipcMain.handle("repo:cherryPick", async (_, projectId: string, refs: string[]) => {
		await runMutation(projectId, (git, cwd) => git.cherryPick(cwd, refs), {
			emitConflicts: true,
		});
	});

	ipcMain.handle("repo:cherryPickAbort", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.cherryPickAbort(cwd));
	});

	ipcMain.handle("repo:cherryPickContinue", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.cherryPickContinue(cwd), {
			emitConflicts: true,
		});
	});

	// Conflicts
	ipcMain.handle("repo:getConflictFiles", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			const conflictFiles = await getGitProvider().getConflictFiles(cwd);
			if (conflictFiles.length > 0) {
				emitConflictDetected(projectId, {
					type: "merge",
					conflictFiles,
				});
			}
			return conflictFiles;
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle("repo:markResolved", async (_, projectId: string, paths: string[]) => {
		await runMutation(projectId, (git, cwd) => git.markResolved(cwd, paths), {
			emitConflicts: true,
		});
	});

	// Config
	ipcMain.handle("repo:getEffectiveConfig", async (_, projectId: string) => {
		const { getEffectiveConfig } = await import("../services/settings/git-config.js");
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return getEffectiveConfig(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle(
		"repo:setLocalConfig",
		async (_, projectId: string, key: string, value: string): Promise<void> => {
			const { setLocalConfig } = await import("../services/settings/git-config.js");
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			try {
				setLocalConfig(cwd, key, value);
				invalidateAndEmit(projectId);
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle(
		"repo:testSigning",
		async (_, projectId: string, key?: string): Promise<{ ok: boolean; message: string }> => {
			const { testSigningConfig } = await import("../services/settings/git-config.js");
			const cwd = getRepoPath(projectId);
			if (!cwd) {
				return { ok: false, message: "Project not found." };
			}
			try {
				return testSigningConfig(cwd, key);
			} catch (error) {
				emitRepoError(projectId, error);
				return {
					ok: false,
					message: error instanceof Error ? error.message : "Signing test failed.",
				};
			}
		}
	);

	// Worktrees
	ipcMain.handle("repo:listWorktrees", async (_, projectId: string) => {
		const project = getProject(projectId);
		if (!project) return [];
		const cwd = project.path;
		const provider = getGitProvider();
		try {
			return await listWorktreesManager(cwd, provider);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle(
		"repo:addWorktree",
		async (_, projectId: string, branch: string, newBranch?: string) => {
			const project = getProject(projectId);
			if (!project) throw new Error("Project not found");
			try {
				const worktreePath = await addWorktreeManager(
					project.path,
					project.name,
					branch,
					newBranch,
					getGitProvider()
				);
				emitRepoUpdated(projectId);
				return worktreePath;
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle(
		"repo:removeWorktree",
		async (_, projectId: string, worktreePath: string, force?: boolean) => {
			const project = getProject(projectId);
			if (!project) return;
			try {
				const provider = getGitProvider();
				try {
					await removeWorktreeManager(project.path, worktreePath, provider, force);
				} catch (error) {
					if (!force && shouldForceRemoveWorktree(error)) {
						await removeWorktreeManager(project.path, worktreePath, provider, true);
					} else {
						throw error;
					}
				}
				emitRepoUpdated(projectId);
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle("repo:pruneWorktrees", async (_, projectId: string) => {
		const project = getProject(projectId);
		if (!project) return;
		try {
			await pruneWorktreesManager(project.path, getGitProvider());
			emitRepoUpdated(projectId);
		} catch (error) {
			emitRepoError(projectId, error);
			throw error;
		}
	});
}
