import { readFileSync } from "fs";
import { join } from "path";
import simpleGit, { SimpleGit, StatusResult } from "simple-git";

function buildNewFileDiff(repoPath: string, filePath: string): string | null {
	try {
		const fullPath = join(repoPath, filePath);
		const content = readFileSync(fullPath, "utf-8");
		if (content.includes("\0")) return null;
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
import type {
	GetPatchOptions,
	GetTreeOptions,
	GitProvider,
	RepoFingerprint,
	WorktreeInfo,
} from "./types.js";
import type {
	BranchInfo,
	CommitInfo,
	RepoStatus,
	RemoteInfo,
	StashEntry,
	TreeNode,
} from "../../../shared/types.js";

function createGit(cwd: string, binary?: string | null, env?: NodeJS.ProcessEnv): SimpleGit {
	const opts: { baseDir: string; binary?: string; env?: NodeJS.ProcessEnv } = {
		baseDir: cwd,
	};
	if (binary) opts.binary = binary;
	if (env) opts.env = { ...process.env, ...env };
	return simpleGit(opts);
}

function buildTreeFromPaths(
	paths: string[],
	statusMap: Map<string, string>,
	changedOnly: boolean
): TreeNode[] {
	interface MutableNode {
		name: string;
		path: string;
		children: Map<string, MutableNode>;
		fileStatus?: string;
	}

	const root: MutableNode = {
		name: "",
		path: "",
		children: new Map(),
	};

	function ensurePath(parts: string[], fileStatus?: string) {
		let current = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const pathSoFar = parts.slice(0, i + 1).join("/");
			const isLast = i === parts.length - 1;

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path: pathSoFar,
					children: new Map(),
					...(isLast && fileStatus && { fileStatus }),
				});
			}
			const child = current.children.get(part)!;
			if (isLast && fileStatus) child.fileStatus = fileStatus;
			current = child;
		}
	}

	for (const p of paths) {
		const status = statusMap.get(p);
		if (changedOnly && !status) continue;
		const parts = p.split("/").filter(Boolean);
		if (parts.length === 0) continue;
		ensurePath(parts, status ?? undefined);
	}

	function toTreeNode(node: MutableNode, depth: number): TreeNode[] {
		const result: TreeNode[] = [];
		const sorted = Array.from(node.children.entries()).sort(([a], [b]) =>
			a.localeCompare(b, undefined, { sensitivity: "base" })
		);
		for (const [, child] of sorted) {
			const hasChildren = child.children.size > 0;
			result.push({
				path: child.path,
				name: child.name,
				kind: hasChildren ? "dir" : "file",
				depth,
				hasChildren,
				gitStatus: child.fileStatus,
			});
			if (hasChildren) {
				result.push(...toTreeNode(child, depth + 1));
			}
		}
		return result;
	}

	return toTreeNode(root, 0);
}

function statusToMap(status: StatusResult): Map<string, string> {
	const m = new Map<string, string>();
	for (const f of status.files) {
		if (f.index !== " " && f.index !== "?") m.set(f.path, "staged");
		else if (f.working_dir !== " " && f.working_dir !== "?") m.set(f.path, "unstaged");
	}
	for (const p of status.not_added) m.set(p, "untracked");
	return m;
}

export function createSimpleGitProvider(
	binary?: string | null,
	env?: NodeJS.ProcessEnv
): GitProvider {
	return {
		async getTree(opts): Promise<TreeNode[]> {
			const git = createGit(opts.cwd, binary, env);
			const [rawIgnored, rawTracked, status] = await Promise.all([
				opts.includeIgnored
					? git
							.raw(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])
							.catch(() => "")
					: Promise.resolve(""),
				git.raw(["ls-files", "-z"]).catch(() => ""),
				git.status().catch(() => null),
			]);
			const allPaths = new Set<string>();
			for (const p of rawTracked.split("\0").filter(Boolean)) allPaths.add(p);
			for (const p of rawIgnored.split("\0").filter(Boolean)) allPaths.add(p);
			if (status) {
				for (const p of status.not_added) allPaths.add(p);
			}
			const statusMap = status ? statusToMap(status) : new Map();
			return buildTreeFromPaths(Array.from(allPaths), statusMap, opts.changedOnly ?? false);
		},

		async getStatus(cwd: string): Promise<RepoStatus | null> {
			try {
				const git = createGit(cwd, binary, env);
				const [head, branch, status] = await Promise.all([
					git.revparse(["HEAD"]).catch(() => ({ value: "" })),
					git.branch().catch(() => ({ current: "" })),
					git.status().catch(() => null),
				]);
				if (!status) return null;
				const headOid = (head as { value?: string })?.value?.trim() ?? "";
				const currentBranch = (branch as { current?: string })?.current ?? "";
				const staged: string[] = [];
				const unstaged: string[] = [];
				const untracked: string[] = [];
				for (const f of status.files) {
					if (f.index !== " " && f.index !== "?") staged.push(f.path);
					if (f.working_dir !== " " && f.working_dir !== "?") unstaged.push(f.path);
				}
				for (const p of status.not_added) {
					if (!staged.includes(p) && !unstaged.includes(p)) untracked.push(p);
				}
				return { headOid, branch: currentBranch, staged, unstaged, untracked };
			} catch {
				return null;
			}
		},

		async getPatch(opts: GetPatchOptions): Promise<string | null> {
			try {
				const git = createGit(opts.cwd, binary, env);
				if (opts.scope === "staged") {
					return git.diff(["--cached", "--", opts.filePath]);
				}
				if (opts.scope === "untracked") {
					try {
						return git.diff(["--no-index", "/dev/null", join(opts.cwd, opts.filePath)]);
					} catch {
						return buildNewFileDiff(opts.cwd, opts.filePath);
					}
				}
				return git.diff(["--", opts.filePath]);
			} catch {
				return null;
			}
		},

		async getHeadOid(cwd: string): Promise<string | null> {
			try {
				const git = createGit(cwd, binary, env);
				const r = await git.revparse(["HEAD"]);
				return (r as string)?.trim() ?? null;
			} catch {
				return null;
			}
		},

		async getRepoFingerprint(cwd: string): Promise<RepoFingerprint | null> {
			try {
				const { statSync } = await import("fs");
				const git = createGit(cwd, binary, env);
				const [head, status] = await Promise.all([
					git.revparse(["HEAD"]).catch(() => ""),
					git.status().catch(() => null),
				]);
				const headOid = (head as string)?.trim() ?? "";
				const indexPath = join(cwd, ".git/index");
				let indexMtimeMs = 0;
				try {
					indexMtimeMs = statSync(indexPath).mtimeMs;
				} catch {
					// no index
				}
				const statusHash = status
					? JSON.stringify({
							staged: status.files.filter((f) => f.index !== " " && f.index !== "?"),
							unstaged: status.files.filter(
								(f) => f.working_dir !== " " && f.working_dir !== "?"
							),
						})
					: "";
				return {
					repoPath: cwd,
					headOid,
					indexMtimeMs,
					statusHash,
				};
			} catch {
				return null;
			}
		},

		async stageFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.add(paths);
		},

		async unstageFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.reset(["--", ...paths]);
		},

		async stageAll(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.add(["-A"]);
		},

		async unstageAll(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.reset(["HEAD"]);
		},

		async discardFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.checkout(["--", ...paths]);
		},

		async discardAllUnstaged(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.checkout(["."]);
		},

		async commit(cwd, opts): Promise<{ oid: string; signed: boolean }> {
			const git = createGit(cwd, binary, env);
			const args: string[] = ["-m", opts.message];
			if (opts.amend) args.push("--amend");
			if (opts.sign) args.push("-S");
			await git.commit(args);
			const rev = await git.revparse(["HEAD"]);
			const oid = (rev as string)?.trim() ?? "";
			const logOut = await git.raw(["log", "-1", "--format=%G?"]);
			const signed = (logOut as string)?.trim() === "G" || (logOut as string)?.trim() === "S";
			return { oid, signed };
		},

		async getLog(cwd, opts): Promise<CommitInfo[]> {
			const git = createGit(cwd, binary, env);
			const args = ["log", "--format=%H%n%s%n%an%n%ae%n%ai%n%P%n%G?"];
			if (opts?.limit) args.push(`-n`, String(opts.limit));
			if (opts?.offset) args.push("--skip", String(opts.offset));
			if (opts?.branch) args.push(opts.branch);
			const out = (await git.raw(args)) as string;
			const lines = out.trim().split("\n");
			const entries: CommitInfo[] = [];
			for (let i = 0; i + 6 < lines.length; i += 7) {
				const oid = lines[i]?.trim() ?? "";
				if (!oid) break;
				entries.push({
					oid,
					message: lines[i + 1] ?? "",
					author: {
						name: lines[i + 2] ?? "",
						email: lines[i + 3] ?? "",
						date: lines[i + 4] ?? "",
					},
					parents: (lines[i + 5] ?? "").split(/\s+/).filter(Boolean),
					signed: (lines[i + 6] ?? "") === "G" || (lines[i + 6] ?? "") === "S",
				});
			}
			return entries;
		},

		async listBranches(cwd: string): Promise<BranchInfo[]> {
			const git = createGit(cwd, binary, env);
			const [summary, status] = await Promise.all([
				git.branchLocal(),
				git.status().catch(() => null),
			]);
			const currentAhead = (status as { ahead?: number })?.ahead ?? 0;
			const currentBehind = (status as { behind?: number })?.behind ?? 0;
			const result: BranchInfo[] = [];
			for (const [name, b] of Object.entries(summary.branches)) {
				const br = b as { tracking?: string };
				result.push({
					name,
					current: name === summary.current,
					tracking: br.tracking,
					ahead: name === summary.current ? currentAhead : 0,
					behind: name === summary.current ? currentBehind : 0,
				});
			}
			return result;
		},

		async createBranch(cwd: string, name: string, startPoint?: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			if (startPoint) await git.checkoutBranch(name, startPoint);
			else await git.branch([name]);
		},

		async switchBranch(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.checkout(name);
		},

		async deleteBranch(cwd: string, name: string, force?: boolean): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.branch([force ? "-D" : "-d", name]);
		},

		async renameBranch(cwd: string, oldName: string, newName: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.branch(["-m", oldName, newName]);
		},

		async mergeBranch(cwd, source, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			const args: string[] = [source];
			if (opts?.noFf) args.unshift("--no-ff");
			if (opts?.squash) args.unshift("--squash");
			if (opts?.message) args.push("-m", opts.message);
			await git.merge(args);
		},

		async fetch(cwd, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			const args: string[] = [];
			if (opts?.remote) args.push(opts.remote);
			if (opts?.prune) args.push("--prune");
			await git.fetch(args);
		},

		async pull(cwd, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			const args: string[] = opts?.rebase ? ["--rebase"] : [];
			if (opts?.remote) args.push(opts.remote);
			if (opts?.branch) args.push(opts.branch);
			await git.pull(args);
		},

		async push(cwd, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			const args: string[] = [];
			if (opts?.force) args.push("--force");
			if (opts?.setUpstream) args.push("-u");
			if (opts?.remote) args.push(opts.remote);
			if (opts?.branch) args.push(opts.branch);
			await git.push(args);
		},

		async listRemotes(cwd: string): Promise<RemoteInfo[]> {
			const git = createGit(cwd, binary, env);
			const remotes = await git.getRemotes(true);
			return Object.entries(remotes).map(([name, r]) => ({
				name,
				url: r.refs.fetch ?? "",
				pushUrl: r.refs.push,
			}));
		},

		async addRemote(cwd: string, name: string, url: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.addRemote(name, url);
		},

		async removeRemote(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.removeRemote(name);
		},

		async stash(cwd, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.stash([
				"push",
				...(opts?.includeUntracked ? ["-u"] : []),
				...(opts?.message ? ["-m", opts.message] : []),
			]);
		},

		async stashPop(cwd: string, index?: number): Promise<void> {
			const git = createGit(cwd, binary, env);
			if (index != null) await git.stash(["pop", `stash@{${index}}`]);
			else await git.stash(["pop"]);
		},

		async stashApply(cwd: string, index?: number): Promise<void> {
			const git = createGit(cwd, binary, env);
			if (index != null) await git.stash(["apply", `stash@{${index}}`]);
			else await git.stash(["apply"]);
		},

		async stashList(cwd: string): Promise<StashEntry[]> {
			const git = createGit(cwd, binary, env);
			const out = (await git.raw(["stash", "list"])) as string;
			return out
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line, i) => {
					const colonIdx = line.indexOf(": ");
					const message = colonIdx >= 0 ? line.slice(colonIdx + 2) : line;
					const oidMatch = line.match(/\b([a-f0-9]{7,40})\b/);
					return { index: i, message, oid: oidMatch?.[1] ?? "" };
				});
		},

		async stashDrop(cwd: string, index?: number): Promise<void> {
			const git = createGit(cwd, binary, env);
			if (index != null) await git.stash(["drop", `stash@{${index}}`]);
			else await git.stash(["drop"]);
		},

		async listTags(cwd: string): Promise<string[]> {
			const git = createGit(cwd, binary, env);
			const tags = await git.tags();
			return tags.all;
		},

		async createTag(cwd, name, opts): Promise<void> {
			const git = createGit(cwd, binary, env);
			const args: string[] = [name];
			if (opts?.message) args.push("-m", opts.message);
			if (opts?.ref) args.push(opts.ref);
			if (opts?.sign) args.push("-s");
			await git.tag(args);
		},

		async deleteTag(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.tag(["-d", name]);
		},

		async rebase(cwd: string, opts: { onto: string }): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.rebase([opts.onto]);
		},

		async rebaseAbort(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.rebase(["--abort"]);
		},

		async rebaseContinue(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.rebase(["--continue"]);
		},

		async rebaseSkip(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.rebase(["--skip"]);
		},

		async cherryPick(cwd: string, refs: string[]): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.raw(["cherry-pick", ...refs]);
		},

		async cherryPickAbort(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.raw(["cherry-pick", "--abort"]);
		},

		async cherryPickContinue(cwd: string): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.raw(["cherry-pick", "--continue"]);
		},

		async getConflictFiles(cwd: string): Promise<string[]> {
			const git = createGit(cwd, binary, env);
			const out = (await git.raw(["diff", "--name-only", "--diff-filter=U"])) as string;
			return out
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
		},

		async markResolved(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary, env);
			await git.add(paths);
		},

		async listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
			const git = createGit(cwd, binary, env);
			const mainPath = ((await git.revparse(["--show-toplevel"])) as string)?.trim() ?? cwd;
			const out = (await git.raw(["worktree", "list", "--porcelain"])) as string;
			const list: WorktreeInfo[] = [];
			let current: Partial<WorktreeInfo> = {};
			for (const line of out.split("\n")) {
				if (line.startsWith("worktree ")) {
					if (current.path) {
						list.push({
							path: current.path,
							branch: current.branch ?? "",
							head: current.head ?? "",
							isMainWorktree: current.path === mainPath,
						});
					}
					current = { path: line.slice(9).trim() };
				} else if (line.startsWith("HEAD ")) {
					current.head = line.slice(5).trim();
				} else if (line.startsWith("branch ")) {
					current.branch = line.slice(7).replace("refs/heads/", "").trim();
				}
			}
			if (current.path) {
				list.push({
					path: current.path,
					branch: current.branch ?? "",
					head: current.head ?? "",
					isMainWorktree: current.path === mainPath,
				});
			}
			return list;
		},

		async addWorktree(
			repoPath: string,
			worktreePath: string,
			branch: string,
			newBranch?: string
		): Promise<void> {
			const git = createGit(repoPath, binary, env);
			if (newBranch) {
				await git.raw(["worktree", "add", "-b", newBranch, worktreePath, branch]);
			} else {
				await git.raw(["worktree", "add", worktreePath, branch]);
			}
		},

		async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
			const git = createGit(repoPath, binary, env);
			await git.raw(["worktree", "remove", worktreePath]);
		},

		async pruneWorktrees(repoPath: string): Promise<void> {
			const git = createGit(repoPath, binary, env);
			await git.raw(["worktree", "prune"]);
		},
	};
}
