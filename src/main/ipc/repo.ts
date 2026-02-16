import { ipcMain } from "electron";
import { createGitProvider } from "../services/git/index.js";
import { getAppSettings } from "../services/settings/store.js";
import { getProject, getProjectPrefs } from "../services/cache/queries.js";
import {
	listWorktrees as listWorktreesManager,
	addWorktree as addWorktreeManager,
	removeWorktree as removeWorktreeManager,
	pruneWorktrees as pruneWorktreesManager,
} from "../services/worktree/manager.js";
import { invalidateProjectCache } from "../services/cache/queries.js";

function getRepoPath(projectId: string): string | null {
	const project = getProject(projectId);
	if (!project) return null;
	const prefs = getProjectPrefs(projectId);
	const activePath = prefs?.active_worktree_path;
	return activePath && activePath.trim() !== "" ? activePath : project.path;
}

function getGitProvider() {
	const settings = getAppSettings();
	return createGitProvider(settings);
}

export function registerRepoHandlers(): void {
	ipcMain.handle(
		"repo:getTree",
		async (_, projectId: string, includeIgnored?: boolean, changedOnly?: boolean) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return [];
			const git = getGitProvider();
			return git.getTree({ cwd, includeIgnored, changedOnly });
		}
	);

	ipcMain.handle("repo:getStatus", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return null;
		return getGitProvider().getStatus(cwd);
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
			return getGitProvider().getPatch({ cwd, filePath, scope });
		}
	);

	ipcMain.handle("repo:refresh", async (_, projectId: string) => {
		invalidateProjectCache(projectId);
	});

	// Staging
	ipcMain.handle("repo:stageFiles", async (_, projectId: string, paths: string[]) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().stageFiles(cwd, paths);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:unstageFiles", async (_, projectId: string, paths: string[]) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().unstageFiles(cwd, paths);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:stageAll", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().stageAll(cwd);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:unstageAll", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().unstageAll(cwd);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:discardFiles", async (_, projectId: string, paths: string[]) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().discardFiles(cwd, paths);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:discardAllUnstaged", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().discardAllUnstaged(cwd);
		invalidateProjectCache(projectId);
	});

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
			const result = await getGitProvider().commit(cwd, {
				message,
				amend: opts?.amend,
				sign: opts?.sign ?? getAppSettings().signing.enabled,
			});
			invalidateProjectCache(projectId);
			return result;
		}
	);

	ipcMain.handle(
		"repo:getLog",
		async (
			_,
			projectId: string,
			opts?: { limit?: number; branch?: string; offset?: number }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return [];
			return getGitProvider().getLog(cwd, opts);
		}
	);

	// Branches
	ipcMain.handle("repo:listBranches", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getGitProvider().listBranches(cwd);
	});

	ipcMain.handle(
		"repo:createBranch",
		async (_, projectId: string, name: string, startPoint?: string) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().createBranch(cwd, name, startPoint);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle("repo:switchBranch", async (_, projectId: string, name: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().switchBranch(cwd, name);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle(
		"repo:deleteBranch",
		async (_, projectId: string, name: string, force?: boolean) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().deleteBranch(cwd, name, force);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle(
		"repo:renameBranch",
		async (_, projectId: string, oldName: string, newName: string) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().renameBranch(cwd, oldName, newName);
			invalidateProjectCache(projectId);
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
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().mergeBranch(cwd, source, opts);
			invalidateProjectCache(projectId);
		}
	);

	// Remote
	ipcMain.handle(
		"repo:fetch",
		async (_, projectId: string, opts?: { remote?: string; prune?: boolean }) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().fetch(cwd, opts);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle(
		"repo:pull",
		async (
			_,
			projectId: string,
			opts?: { remote?: string; branch?: string; rebase?: boolean }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().pull(cwd, opts);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle(
		"repo:push",
		async (
			_,
			projectId: string,
			opts?: { remote?: string; branch?: string; force?: boolean; setUpstream?: boolean }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().push(cwd, opts);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle("repo:listRemotes", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getGitProvider().listRemotes(cwd);
	});

	ipcMain.handle("repo:addRemote", async (_, projectId: string, name: string, url: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().addRemote(cwd, name, url);
	});

	ipcMain.handle("repo:removeRemote", async (_, projectId: string, name: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().removeRemote(cwd, name);
	});

	// Stash
	ipcMain.handle(
		"repo:stash",
		async (_, projectId: string, opts?: { message?: string; includeUntracked?: boolean }) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().stash(cwd, opts);
			invalidateProjectCache(projectId);
		}
	);

	ipcMain.handle("repo:stashPop", async (_, projectId: string, index?: number) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().stashPop(cwd, index);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:stashApply", async (_, projectId: string, index?: number) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().stashApply(cwd, index);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:stashList", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getGitProvider().stashList(cwd);
	});

	ipcMain.handle("repo:stashDrop", async (_, projectId: string, index?: number) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().stashDrop(cwd, index);
		invalidateProjectCache(projectId);
	});

	// Tags
	ipcMain.handle("repo:listTags", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getGitProvider().listTags(cwd);
	});

	ipcMain.handle(
		"repo:createTag",
		async (
			_,
			projectId: string,
			name: string,
			opts?: { message?: string; ref?: string; sign?: boolean }
		) => {
			const cwd = getRepoPath(projectId);
			if (!cwd) return;
			await getGitProvider().createTag(cwd, name, opts);
		}
	);

	ipcMain.handle("repo:deleteTag", async (_, projectId: string, name: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().deleteTag(cwd, name);
	});

	// Rebase
	ipcMain.handle("repo:rebase", async (_, projectId: string, opts: { onto: string }) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().rebase(cwd, opts);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:rebaseAbort", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().rebaseAbort(cwd);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:rebaseContinue", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().rebaseContinue(cwd);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:rebaseSkip", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().rebaseSkip(cwd);
		invalidateProjectCache(projectId);
	});

	// Cherry-pick
	ipcMain.handle("repo:cherryPick", async (_, projectId: string, refs: string[]) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().cherryPick(cwd, refs);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:cherryPickAbort", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().cherryPickAbort(cwd);
		invalidateProjectCache(projectId);
	});

	ipcMain.handle("repo:cherryPickContinue", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().cherryPickContinue(cwd);
		invalidateProjectCache(projectId);
	});

	// Conflicts
	ipcMain.handle("repo:getConflictFiles", async (_, projectId: string) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getGitProvider().getConflictFiles(cwd);
	});

	ipcMain.handle("repo:markResolved", async (_, projectId: string, paths: string[]) => {
		const cwd = getRepoPath(projectId);
		if (!cwd) return;
		await getGitProvider().markResolved(cwd, paths);
		invalidateProjectCache(projectId);
	});

	// Config
	ipcMain.handle("repo:getEffectiveConfig", async (_, projectId: string) => {
		const { getEffectiveConfig } = await import("../services/settings/git-config.js");
		const cwd = getRepoPath(projectId);
		if (!cwd) return [];
		return getEffectiveConfig(cwd);
	});

	// Worktrees
	ipcMain.handle("repo:listWorktrees", async (_, projectId: string) => {
		const project = getProject(projectId);
		if (!project) return [];
		const cwd = project.path;
		const provider = getGitProvider();
		return listWorktreesManager(cwd, provider);
	});

	ipcMain.handle(
		"repo:addWorktree",
		async (_, projectId: string, branch: string, newBranch?: string) => {
			const project = getProject(projectId);
			if (!project) throw new Error("Project not found");
			return addWorktreeManager(
				project.path,
				project.name,
				branch,
				newBranch,
				getGitProvider()
			);
		}
	);

	ipcMain.handle("repo:removeWorktree", async (_, projectId: string, worktreePath: string) => {
		const project = getProject(projectId);
		if (!project) return;
		await removeWorktreeManager(project.path, worktreePath, getGitProvider());
	});

	ipcMain.handle("repo:pruneWorktrees", async (_, projectId: string) => {
		const project = getProject(projectId);
		if (!project) return;
		await pruneWorktreesManager(project.path, getGitProvider());
	});
}
