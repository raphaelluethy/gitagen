import { BrowserWindow, dialog, ipcMain, shell, type MessageBoxOptions } from "electron";
import { generateCommitMessage } from "../services/ai/commit-message.js";
import { resolve, normalize } from "path";
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
	getLogCache,
	setLogCache,
	updateProjectLastOpened,
} from "../services/cache/queries.js";
import { prefsRowToPrefs } from "../services/cache/utils.js";
import {
	listWorktrees as listWorktreesManager,
	addWorktree as addWorktreeManager,
	removeWorktree as removeWorktreeManager,
	pruneWorktrees as pruneWorktreesManager,
} from "../services/worktree/manager.js";
import { emitConflictDetected, emitRepoError, emitRepoUpdated } from "./events.js";
import { watchProject, unwatchProject } from "../services/watcher/index.js";
import type {
	AddWorktreeOptions,
	AddWorktreeResult,
	BranchInfo,
	CommitInfo,
	ConfirmDialogOptions,
	ConflictState,
	FileChange,
	ProjectOpenData,
	ProjectPrefs,
	RemoteInfo,
	RepoStatus,
	TreeNode,
} from "../../shared/types.js";

const AGENT_DEBUG = process.env.GITAGEN_AGENT_DEBUG === "1";

function debugRepo(label: string, message: string): void {
	if (!AGENT_DEBUG) return;
	console.info(`[agent][${label}] ${message}`);
}

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

async function getRepoPath(projectId: string): Promise<string | null> {
	const project = await getProject(projectId);
	if (!project) return null;
	const prefs = await getProjectPrefs(projectId);
	const activePath = prefs?.active_worktree_path;
	return activePath && activePath.trim() !== "" ? activePath : project.path;
}

async function getGitProvider(): Promise<GitProvider> {
	const settings = await getAppSettings();
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

async function setRepoCacheSafe(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean,
	treeData: string | null,
	statusData: string | null
): Promise<void> {
	try {
		await setRepoCache(projectId, fingerprint, includeIgnored, treeData, statusData);
	} catch (error) {
		console.error("[setRepoCacheSafe] Cache write failed:", error);
	}
}

async function setPatchCacheSafe(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string,
	patchText: string
): Promise<void> {
	try {
		await setPatchCache(projectId, filePath, scope, fingerprint, patchText);
	} catch (error) {
		console.error("[setPatchCacheSafe] Cache write failed:", error);
	}
}

async function invalidateAndEmit(projectId: string): Promise<void> {
	await invalidateProjectCache(projectId);
	emitRepoUpdated(projectId);
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
	} catch (error) {
		console.error("[emitConflictsIfAny] Failed to check conflicts:", error);
	}
}

async function runMutation<T>(
	projectId: string,
	action: (git: GitProvider, cwd: string) => Promise<T>,
	opts?: { emitConflicts?: boolean }
): Promise<T> {
	const cwd = await getRepoPath(projectId);
	if (!cwd) throw new Error("Project not found");
	const git = await getGitProvider();
	try {
		const result = await action(git, cwd);
		await invalidateAndEmit(projectId);
		if (opts?.emitConflicts) {
			await emitConflictsIfAny(projectId, git, cwd);
		}
		return result;
	} catch (error) {
		emitRepoError(projectId, error);
		throw error;
	}
}

export function registerRepoHandlers(): void {
	ipcMain.handle(
		"repo:openProject",
		async (_, projectId: string): Promise<ProjectOpenData | null> => {
			const project = await getProject(projectId);
			if (!project) return null;

			const now = Math.floor(Date.now() / 1000);

			const [prefsRow, cachedLogRow, git] = await Promise.all([
				getProjectPrefs(projectId),
				getLogCache(projectId),
				getGitProvider(),
			]);

			updateProjectLastOpened(projectId, now);

			const prefs: ProjectPrefs | null = prefsRow ? prefsRowToPrefs(prefsRow) : null;

			let cachedLog: CommitInfo[] | null = null;
			let cachedUnpushedOids: string[] | null = null;
			if (cachedLogRow) {
				try {
					cachedLog = JSON.parse(cachedLogRow.commits_json) as CommitInfo[];
					if (cachedLogRow.unpushed_oids_json) {
						cachedUnpushedOids = JSON.parse(
							cachedLogRow.unpushed_oids_json
						) as string[];
					}
				} catch {
					// ignore parse errors
				}
			}

			const activePath = prefsRow?.active_worktree_path;
			const cwd = activePath && activePath.trim() !== "" ? activePath : project.path;
			if (!cwd) {
				return {
					status: null,
					branches: [],
					remotes: [],
					cachedLog,
					cachedUnpushedOids,
					prefs,
				};
			}

			const [status, branches, remotes] = await Promise.all([
				(async () => {
					try {
						const baseFingerprint = await getBaseFingerprintKey(git, cwd);
						if (baseFingerprint) {
							const cached = await getRepoCache(projectId, baseFingerprint, false);
							const raw = parseJsonSafe<unknown>(cached?.status_data ?? null);
							const cachedStatus = raw ? migrateRepoStatus(raw) : null;
							if (cachedStatus) return cachedStatus;
						}
						const s = await git.getStatus(cwd);
						if (baseFingerprint && s) {
							setRepoCacheSafe(
								projectId,
								baseFingerprint,
								false,
								null,
								JSON.stringify(s)
							);
						}
						return s;
					} catch {
						emitRepoError(projectId, new Error("Failed to get status"));
						return null;
					}
				})(),
				git.listBranches(cwd).catch(() => [] as BranchInfo[]),
				git.listRemotes(cwd).catch(() => [] as RemoteInfo[]),
			]);

			return {
				status,
				branches,
				remotes,
				cachedLog,
				cachedUnpushedOids,
				prefs,
			};
		}
	);

	ipcMain.handle(
		"repo:getTree",
		async (_, projectId: string, includeIgnored?: boolean, changedOnly?: boolean) => {
			const cwd = await getRepoPath(projectId);
			if (!cwd) return [];
			const git = await getGitProvider();
			const includeIgnoredFlag = Boolean(includeIgnored);
			const changedOnlyFlag = Boolean(changedOnly);
			try {
				const baseFingerprint = await getBaseFingerprintKey(git, cwd);
				const treeFingerprint = baseFingerprint
					? `${baseFingerprint}|tree:${changedOnlyFlag ? "1" : "0"}`
					: null;
				if (treeFingerprint) {
					const cached = await getRepoCache(
						projectId,
						treeFingerprint,
						includeIgnoredFlag
					);
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
		const startedAt = Date.now();
		debugRepo("repo:getStatus", `start projectId=${projectId}`);
		const cwd = await getRepoPath(projectId);
		if (!cwd) {
			debugRepo("repo:getStatus", `project not found projectId=${projectId}`);
			return null;
		}
		const git = await getGitProvider();
		try {
			const baseFingerprint = await getBaseFingerprintKey(git, cwd);
			if (baseFingerprint) {
				const cached = await getRepoCache(projectId, baseFingerprint, false);
				const raw = parseJsonSafe<unknown>(cached?.status_data ?? null);
				const cachedStatus = raw ? migrateRepoStatus(raw) : null;
				if (cachedStatus) {
					debugRepo(
						"repo:getStatus",
						`cache hit projectId=${projectId} took=${Date.now() - startedAt}ms`
					);
					return cachedStatus;
				}
			}

			const status = await git.getStatus(cwd);
			if (baseFingerprint && status) {
				setRepoCacheSafe(projectId, baseFingerprint, false, null, JSON.stringify(status));
			}
			debugRepo(
				"repo:getStatus",
				`ok projectId=${projectId} took=${Date.now() - startedAt}ms staged=${status?.staged.length ?? 0} unstaged=${status?.unstaged.length ?? 0} untracked=${status?.untracked.length ?? 0}`
			);
			return status;
		} catch (error) {
			debugRepo(
				"repo:getStatus",
				`error projectId=${projectId} took=${Date.now() - startedAt}ms message=${error instanceof Error ? error.message : String(error)}`
			);
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
			const startedAt = Date.now();
			debugRepo(
				"repo:getPatch",
				`start projectId=${projectId} scope=${scope} filePath=${filePath}`
			);
			const cwd = await getRepoPath(projectId);
			if (!cwd) {
				debugRepo("repo:getPatch", `project not found projectId=${projectId}`);
				return null;
			}
			const git = await getGitProvider();
			try {
				const baseFingerprint = await getBaseFingerprintKey(git, cwd);
				const patchFingerprint = baseFingerprint ? `${baseFingerprint}|patch` : null;
				if (patchFingerprint) {
					const cached = await getPatchCache(
						projectId,
						filePath,
						scope,
						patchFingerprint
					);
					if (cached != null) {
						debugRepo(
							"repo:getPatch",
							`cache hit projectId=${projectId} scope=${scope} filePath=${filePath} took=${Date.now() - startedAt}ms`
						);
						return cached;
					}
				}

				const patch = await git.getPatch({ cwd, filePath, scope });
				if (patchFingerprint && patch != null) {
					setPatchCacheSafe(projectId, filePath, scope, patchFingerprint, patch);
				}
				debugRepo(
					"repo:getPatch",
					`ok projectId=${projectId} scope=${scope} filePath=${filePath} took=${Date.now() - startedAt}ms hasPatch=${String(patch != null)}`
				);
				return patch;
			} catch (error) {
				debugRepo(
					"repo:getPatch",
					`error projectId=${projectId} scope=${scope} filePath=${filePath} took=${Date.now() - startedAt}ms message=${error instanceof Error ? error.message : String(error)}`
				);
				emitRepoError(projectId, error);
				return null;
			}
		}
	);

	ipcMain.handle(
		"repo:getAllDiffs",
		async (_, projectId: string): Promise<{ path: string; scope: string; diff: string }[]> => {
			const startedAt = Date.now();
			debugRepo("repo:getAllDiffs", `start projectId=${projectId}`);
			const cwd = await getRepoPath(projectId);
			if (!cwd) {
				debugRepo("repo:getAllDiffs", `project not found projectId=${projectId}`);
				return [];
			}
			const git = await getGitProvider();
			try {
				const status = await git.getStatus(cwd);
				if (!status) return [];

				const entries: { path: string; scope: "staged" | "unstaged" | "untracked" }[] = [];
				for (const f of status.staged) entries.push({ path: f.path, scope: "staged" });
				for (const f of status.unstaged) entries.push({ path: f.path, scope: "unstaged" });
				for (const f of status.untracked)
					entries.push({ path: f.path, scope: "untracked" });

				const results = (
					await Promise.all(
						entries.map(async (entry) => {
							const patch = await git.getPatch({
								cwd,
								filePath: entry.path,
								scope: entry.scope,
							});
							if (patch != null) {
								return { path: entry.path, scope: entry.scope, diff: patch };
							}
							return null;
						})
					)
				).filter(
					(
						r
					): r is {
						path: string;
						scope: "staged" | "unstaged" | "untracked";
						diff: string;
					} => r != null
				);
				debugRepo(
					"repo:getAllDiffs",
					`ok projectId=${projectId} took=${Date.now() - startedAt}ms entries=${entries.length} results=${results.length}`
				);
				return results;
			} catch (error) {
				debugRepo(
					"repo:getAllDiffs",
					`error projectId=${projectId} took=${Date.now() - startedAt}ms message=${error instanceof Error ? error.message : String(error)}`
				);
				emitRepoError(projectId, error);
				return [];
			}
		}
	);

	ipcMain.handle("repo:refresh", async (_, projectId: string) => {
		await invalidateAndEmit(projectId);
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

	ipcMain.handle("repo:deleteUntrackedFiles", async (_, projectId: string, paths: string[]) => {
		await runMutation(projectId, (git, cwd) => git.deleteUntrackedFiles(cwd, paths));
	});

	ipcMain.handle("repo:discardAll", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.discardAll(cwd));
	});

	ipcMain.handle(
		"repo:openInEditor",
		async (_, projectId: string, filePath: string): Promise<void> => {
			const cwd = await getRepoPath(projectId);
			if (!cwd) throw new Error("Project not found");
			const normalizedFilePath = normalize(filePath);
			if (normalizedFilePath.startsWith("..") || filePath.includes("\0")) {
				throw new Error("Invalid file path");
			}
			const fullPath = resolve(cwd, filePath);
			if (!fullPath.startsWith(resolve(cwd))) {
				throw new Error("Path traversal detected");
			}
			await shell.openPath(fullPath);
		}
	);

	ipcMain.handle("app:openExternal", async (event, url: string): Promise<void> => {
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error("Invalid URL format");
		}
		if (parsedUrl.protocol !== "https:") {
			throw new Error("Only https URLs are allowed");
		}
		const allowedDomains = ["github.com", "gitlab.com", "bitbucket.org", "dev.azure.com"];
		const isAllowed = allowedDomains.some(
			(domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
		);
		if (!isAllowed) {
			const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
			const config: MessageBoxOptions = {
				type: "warning",
				title: "Open External Link",
				message: "Open external link?",
				detail: `Do you want to open ${url}?`,
				buttons: ["Cancel", "Open"],
				defaultId: 1,
				cancelId: 0,
			};
			const result = win
				? await dialog.showMessageBox(win, config)
				: await dialog.showMessageBox(config);
			if (result.response !== 1) {
				return;
			}
		}
		await shell.openExternal(url, { activate: true });
	});

	ipcMain.handle(
		"app:confirm",
		async (event, options: ConfirmDialogOptions): Promise<boolean> => {
			const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
			const config: MessageBoxOptions = {
				type: "question",
				title: options.title ?? "Confirm",
				message: options.message,
				detail: options.detail ?? "",
				buttons: [options.cancelLabel ?? "Cancel", options.confirmLabel ?? "OK"],
				defaultId: 1,
				cancelId: 0,
				normalizeAccessKeys: true,
			};
			const result = win
				? await dialog.showMessageBox(win, config)
				: await dialog.showMessageBox(config);
			return result.response === 1;
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
			const cwd = await getRepoPath(projectId);
			if (!cwd) throw new Error("Project not found");
			const git = await getGitProvider();
			try {
				const result = await git.commit(cwd, {
					message,
					amend: opts?.amend,
					sign: opts?.sign ?? (await getAppSettings()).signing.enabled,
				});
				await invalidateAndEmit(projectId);
				await emitConflictsIfAny(projectId, git, cwd);
				return result;
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle("repo:undoLastCommit", async (_, projectId: string) => {
		await runMutation(projectId, (git, cwd) => git.undoLastCommit(cwd));
	});

	ipcMain.handle("repo:getUnpushedOids", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return null;
		try {
			return (await getGitProvider()).getUnpushedOids(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return null;
		}
	});

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
			const startedAt = Date.now();
			debugRepo(
				"repo:getLog",
				`start projectId=${projectId} limit=${opts?.limit ?? "default"} branch=${opts?.branch ?? "current"} offset=${opts?.offset ?? 0}`
			);
			const cwd = await getRepoPath(projectId);
			if (!cwd) {
				debugRepo("repo:getLog", `project not found projectId=${projectId}`);
				return [];
			}
			try {
				const git = await getGitProvider();
				const shouldCache = !opts?.branch && !opts?.offset;
				const [commits, unpushed] = await Promise.all([
					git.getLog(cwd, opts),
					shouldCache ? git.getUnpushedOids(cwd) : Promise.resolve(null),
				]);
				if (shouldCache) {
					try {
						const headOid = commits.length > 0 ? commits[0]!.oid : null;
						const unpushedJson =
							unpushed && unpushed.length > 0 ? JSON.stringify(unpushed) : null;
						await setLogCache(
							projectId,
							JSON.stringify(commits),
							headOid,
							unpushedJson
						);
					} catch {
						// Cache write failure must never discard actual git data
					}
				}
				debugRepo(
					"repo:getLog",
					`ok projectId=${projectId} took=${Date.now() - startedAt}ms commits=${commits.length}`
				);
				return commits;
			} catch (error) {
				debugRepo(
					"repo:getLog",
					`error projectId=${projectId} took=${Date.now() - startedAt}ms message=${error instanceof Error ? error.message : String(error)}`
				);
				emitRepoError(projectId, error);
				return [];
			}
		}
	);

	ipcMain.handle("repo:getCachedLog", async (_, projectId: string) => {
		try {
			const cached = await getLogCache(projectId);
			if (!cached) return null;
			return JSON.parse(cached.commits_json);
		} catch {
			return null;
		}
	});

	ipcMain.handle("repo:getCommitDetail", async (_, projectId: string, oid: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return null;
		try {
			return (await getGitProvider()).getCommitDetail(cwd, oid);
		} catch (error) {
			emitRepoError(projectId, error);
			return null;
		}
	});

	// Branches
	ipcMain.handle("repo:listBranches", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return (await getGitProvider()).listBranches(cwd);
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
			return runMutation(projectId, (git, cwd) => git.fetch(cwd, opts));
		}
	);

	ipcMain.handle(
		"repo:pull",
		async (
			_,
			projectId: string,
			opts?: {
				remote?: string;
				branch?: string;
				rebase?: boolean;
				behind?: number;
			}
		) => {
			return runMutation(projectId, (git, cwd) => git.pull(cwd, opts), {
				emitConflicts: true,
			});
		}
	);

	ipcMain.handle(
		"repo:push",
		async (
			_,
			projectId: string,
			opts?: {
				remote?: string;
				branch?: string;
				force?: boolean;
				setUpstream?: boolean;
				ahead?: number;
			}
		) => {
			return runMutation(projectId, (git, cwd) => git.push(cwd, opts));
		}
	);

	ipcMain.handle(
		"repo:pushTags",
		async (_, projectId: string, opts?: { remote?: string; tags?: string[] }) => {
			return runMutation(projectId, (git, cwd) => git.pushTags(cwd, opts));
		}
	);

	ipcMain.handle("repo:listRemotes", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return (await getGitProvider()).listRemotes(cwd);
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
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return (await getGitProvider()).stashList(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle("repo:stashDrop", async (_, projectId: string, index?: number) => {
		await runMutation(projectId, (git, cwd) => git.stashDrop(cwd, index));
	});

	ipcMain.handle("repo:stashShow", async (_, projectId: string, index: number) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return null;
		try {
			return (await getGitProvider()).stashShow(cwd, index);
		} catch (error) {
			emitRepoError(projectId, error);
			return null;
		}
	});

	// Tags
	ipcMain.handle("repo:listTags", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return (await getGitProvider()).listTags(cwd);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle("repo:listTagsDetailed", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			return (await getGitProvider()).listTagsDetailed(cwd);
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
		const cwd = await getRepoPath(projectId);
		if (!cwd) return [];
		try {
			const conflictFiles = await (await getGitProvider()).getConflictFiles(cwd);
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
		const cwd = await getRepoPath(projectId);
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
			const cwd = await getRepoPath(projectId);
			if (!cwd) return;
			try {
				setLocalConfig(cwd, key, value);
				await invalidateAndEmit(projectId);
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
			const cwd = await getRepoPath(projectId);
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
		const project = await getProject(projectId);
		if (!project) return [];
		const cwd = project.path;
		const provider = await getGitProvider();
		try {
			return await listWorktreesManager(cwd, provider);
		} catch (error) {
			emitRepoError(projectId, error);
			return [];
		}
	});

	ipcMain.handle(
		"repo:addWorktree",
		async (
			_,
			projectId: string,
			branch: string,
			options?: AddWorktreeOptions
		): Promise<AddWorktreeResult> => {
			const project = await getProject(projectId);
			if (!project) throw new Error("Project not found");
			try {
				const sourceWorktreePath = (await getRepoPath(projectId)) ?? project.path;
				const result = await addWorktreeManager(
					project.path,
					project.name,
					branch,
					{
						newBranch: options?.newBranch,
						copyGitIgnores: options?.copyGitIgnores,
						sourceWorktreePath,
					},
					await getGitProvider()
				);
				emitRepoUpdated(projectId);
				return {
					path: result.worktreePath,
					copiedGitignoreCount: result.copiedGitignoreCount,
					copyGitignoreError: result.copyGitignoreError,
				};
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle(
		"repo:removeWorktree",
		async (_, projectId: string, worktreePath: string, force?: boolean) => {
			const project = await getProject(projectId);
			if (!project) return;
			try {
				const provider = await getGitProvider();
				await removeWorktreeManager(project.path, worktreePath, provider, force);
				emitRepoUpdated(projectId);
			} catch (error) {
				emitRepoError(projectId, error);
				throw error;
			}
		}
	);

	ipcMain.handle("repo:pruneWorktrees", async (_, projectId: string) => {
		const project = await getProject(projectId);
		if (!project) return;
		try {
			await pruneWorktreesManager(project.path, await getGitProvider());
			emitRepoUpdated(projectId);
		} catch (error) {
			emitRepoError(projectId, error);
			throw error;
		}
	});

	// File watcher
	ipcMain.handle("repo:watchProject", async (_, projectId: string) => {
		const cwd = await getRepoPath(projectId);
		if (!cwd) return;
		watchProject(projectId, cwd);
	});

	ipcMain.handle("repo:unwatchProject", async (_, projectId: string) => {
		unwatchProject(projectId);
	});
}
