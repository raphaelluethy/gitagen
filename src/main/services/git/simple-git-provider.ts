import { spawn } from "child_process";
import { readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import simpleGit, { SimpleGit, StatusResult } from "simple-git";
import type { FileChange, GitChangeType, StashDetail, TagInfo } from "../../../shared/types.js";

const MAX_NEW_FILE_BYTES = 1024 * 1024;
const STATUS_CACHE_TTL_MS = 1000;
const STATUS_CACHE_MAX_SIZE = 50;
const statusCache = new Map<string, { status: StatusResult; fetchedAt: number }>();

function evictLruStatusCache(): void {
	if (statusCache.size <= STATUS_CACHE_MAX_SIZE) return;
	let oldestKey: string | null = null;
	let oldestTime = Infinity;
	for (const [key, entry] of statusCache) {
		if (entry.fetchedAt < oldestTime) {
			oldestTime = entry.fetchedAt;
			oldestKey = key;
		}
	}
	if (oldestKey) statusCache.delete(oldestKey);
}

async function getStatusCached(git: SimpleGit, cwd: string): Promise<StatusResult | null> {
	const cached = statusCache.get(cwd);
	const now = Date.now();
	if (cached && now - cached.fetchedAt < STATUS_CACHE_TTL_MS) {
		return cached.status;
	}
	const status = await git.status().catch(() => null);
	if (status) {
		evictLruStatusCache();
		statusCache.set(cwd, { status, fetchedAt: now });
	}
	return status;
}

function resolveGitDir(repoPath: string): string | null {
	const dotGitPath = join(repoPath, ".git");
	try {
		const stat = statSync(dotGitPath);
		if (stat.isDirectory()) return dotGitPath;
		if (!stat.isFile()) return null;
		const contents = readFileSync(dotGitPath, "utf-8");
		const match = contents.match(/^gitdir:\s*(.+)$/m);
		if (!match) return null;
		return resolve(repoPath, match[1].trim());
	} catch {
		return null;
	}
}

function listGitPaths(
	cwd: string,
	binary: string | null | undefined,
	args: string[]
): Promise<string[]> {
	return new Promise((resolvePromise) => {
		const cmd = binary ?? "git";
		const child = spawn(cmd, args, { cwd });
		const paths: string[] = [];
		let buffer = "";
		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			let index = buffer.indexOf("\0");
			while (index >= 0) {
				const entry = buffer.slice(0, index);
				if (entry) paths.push(entry);
				buffer = buffer.slice(index + 1);
				index = buffer.indexOf("\0");
			}
		});
		child.on("close", (code) => {
			if (buffer.length > 0) paths.push(buffer);
			if (code === 0) resolvePromise(paths.filter(Boolean));
			else resolvePromise([]);
		});
		child.on("error", () => resolvePromise([]));
	});
}

function buildNewFileDiff(repoPath: string, filePath: string): string | null {
	try {
		const fullPath = join(repoPath, filePath);
		const stats = statSync(fullPath);
		if (stats.size > MAX_NEW_FILE_BYTES) return null;
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
import type { GetPatchOptions, GitProvider, RepoFingerprint } from "./types.js";
import type {
	BranchInfo,
	CommitDetail,
	CommitInfo,
	FetchResultSummary,
	PullResultSummary,
	PushResultSummary,
	RepoStatus,
	RemoteInfo,
	StashEntry,
	TreeNode,
	WorktreeInfo,
} from "../../../shared/types.js";

function createGit(cwd: string, binary?: string | null): SimpleGit {
	const opts: { baseDir: string; binary?: string } = {
		baseDir: cwd,
	};
	if (binary) opts.binary = binary;
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

export function createSimpleGitProvider(binary?: string | null): GitProvider {
	return {
		async getTree(opts): Promise<TreeNode[]> {
			const git = createGit(opts.cwd, binary);
			const includeIgnored = Boolean(opts.includeIgnored) && !opts.changedOnly;
			const includeTracked = !opts.changedOnly;
			const [ignoredPaths, trackedPaths, status] = await Promise.all([
				includeIgnored
					? listGitPaths(opts.cwd, binary, [
							"ls-files",
							"--others",
							"--ignored",
							"--exclude-standard",
							"-z",
						])
					: Promise.resolve([]),
				includeTracked
					? listGitPaths(opts.cwd, binary, ["ls-files", "-z"])
					: Promise.resolve([]),
				getStatusCached(git, opts.cwd),
			]);
			const allPaths = new Set<string>();
			for (const p of trackedPaths) allPaths.add(p);
			for (const p of ignoredPaths) allPaths.add(p);
			if (status) {
				for (const f of status.files) allPaths.add(f.path);
				for (const p of status.not_added) allPaths.add(p);
			}
			const statusMap = status ? statusToMap(status) : new Map();
			return buildTreeFromPaths(Array.from(allPaths), statusMap, opts.changedOnly ?? false);
		},

		async getStatus(cwd: string): Promise<RepoStatus | null> {
			try {
				const git = createGit(cwd, binary);
				const [head, branch, status] = await Promise.all([
					git.revparse(["HEAD"]).catch(() => ({ value: "" })),
					git.branch().catch(() => ({ current: "" })),
					getStatusCached(git, cwd),
				]);
				if (!status) return null;
				const headOid = (head as { value?: string })?.value?.trim() ?? "";
				const currentBranch = (branch as { current?: string })?.current ?? "";
				const stagedPaths = new Set<string>();
				const unstagedPaths = new Set<string>();
				const staged: FileChange[] = [];
				const unstaged: FileChange[] = [];
				const untracked: FileChange[] = [];
				for (const f of status.files) {
					if (f.index !== " " && f.index !== "?") {
						stagedPaths.add(f.path);
						staged.push({ path: f.path, changeType: f.index as GitChangeType });
					}
					if (f.working_dir !== " " && f.working_dir !== "?") {
						unstagedPaths.add(f.path);
						unstaged.push({ path: f.path, changeType: f.working_dir as GitChangeType });
					}
				}
				for (const p of status.not_added) {
					if (!stagedPaths.has(p) && !unstagedPaths.has(p)) {
						untracked.push({ path: p, changeType: "?" });
					}
				}
				return { headOid, branch: currentBranch, staged, unstaged, untracked };
			} catch {
				return null;
			}
		},

		async getPatch(opts: GetPatchOptions): Promise<string | null> {
			try {
				const git = createGit(opts.cwd, binary);
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
				const git = createGit(cwd, binary);
				const r = await git.revparse(["HEAD"]);
				return (r as string)?.trim() ?? null;
			} catch {
				return null;
			}
		},

		async getToplevel(cwd: string): Promise<string | null> {
			try {
				const git = createGit(cwd, binary);
				const out = (await git.revparse(["--show-toplevel"])) as string;
				return out?.trim() ?? null;
			} catch {
				return null;
			}
		},

		async getRepoFingerprint(cwd: string): Promise<RepoFingerprint | null> {
			try {
				const git = createGit(cwd, binary);
				const [head, status] = await Promise.all([
					git.revparse(["HEAD"]).catch(() => ""),
					getStatusCached(git, cwd),
				]);
				const headOid = (head as string)?.trim() ?? "";
				const gitDir = resolveGitDir(cwd) ?? join(cwd, ".git");
				const indexPath = join(gitDir, "index");
				let indexMtimeMs = 0;
				let headMtimeMs = 0;
				try {
					indexMtimeMs = statSync(indexPath).mtimeMs;
				} catch {
					// no index
				}
				try {
					headMtimeMs = statSync(join(gitDir, "HEAD")).mtimeMs;
				} catch {
					// no head file
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
					headMtimeMs,
					statusHash,
				};
			} catch {
				return null;
			}
		},

		async stageFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.add(paths);
		},

		async unstageFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.reset(["--", ...paths]);
		},

		async stageAll(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.add(["-A"]);
		},

		async unstageAll(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.reset(["HEAD"]);
		},

		async discardFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.checkout(["--", ...paths]);
		},

		async discardAllUnstaged(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.checkout(["."]);
		},

		async deleteUntrackedFiles(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.clean("f", ["-f", "--", ...paths]);
		},

		async discardAll(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.reset(["HEAD", "--hard"]);
			await git.clean("f", ["-d", "-f"]);
		},

		async commit(cwd, opts): Promise<{ oid: string; signed: boolean }> {
			const git = createGit(cwd, binary);
			const customArgs: string[] = [];
			if (opts.amend) customArgs.push("--amend");
			if (opts.sign) customArgs.push("-S");
			await git.commit(opts.message, customArgs);
			const rev = await git.revparse(["HEAD"]);
			const oid = (rev as string)?.trim() ?? "";
			const logOut = await git.raw(["log", "-1", "--format=%G?"]);
			const signed = (logOut as string)?.trim() === "G" || (logOut as string)?.trim() === "S";
			return { oid, signed };
		},

		async getLog(cwd, opts): Promise<CommitInfo[]> {
			const git = createGit(cwd, binary);
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

		async getCommitDetail(cwd: string, oid: string): Promise<CommitDetail | null> {
			const git = createGit(cwd, binary);
			try {
				const [logOut, patchOut] = await Promise.all([
					git.raw([
						"log",
						"-1",
						"--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%ai%x00%P%x00%G?",
						oid,
					]) as Promise<string>,
					git.raw(["diff-tree", "-p", "--root", oid]) as Promise<string>,
				]);
				const parts = logOut.trim().split("\0");
				if (parts.length < 8) return null;
				const [
					oidVal,
					message,
					body,
					authorName,
					authorEmail,
					authorDate,
					parentsStr,
					gpgStatus,
				] = parts;
				return {
					oid: oidVal?.trim() ?? oid,
					message: message ?? "",
					body: body ?? "",
					author: {
						name: authorName ?? "",
						email: authorEmail ?? "",
						date: authorDate ?? "",
					},
					parents: (parentsStr ?? "").split(/\s+/).filter(Boolean),
					signed: gpgStatus === "G" || gpgStatus === "S",
					patch: patchOut?.trim() ?? "",
				};
			} catch {
				return null;
			}
		},

		async getUnpushedOids(cwd: string): Promise<string[] | null> {
			const git = createGit(cwd, binary);
			try {
				const out = (await git.raw(["log", "@{u}..HEAD", "--format=%H"])) as string;
				return out.trim().split("\n").filter(Boolean);
			} catch {
				// No upstream tracking branch configured
				return null;
			}
		},

		async undoLastCommit(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.reset(["--soft", "HEAD~1"]);
		},

		async listBranches(cwd: string): Promise<BranchInfo[]> {
			const git = createGit(cwd, binary);
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
			const git = createGit(cwd, binary);
			if (startPoint) await git.checkoutBranch(name, startPoint);
			else await git.branch([name]);
		},

		async switchBranch(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.checkout(name);
		},

		async deleteBranch(cwd: string, name: string, force?: boolean): Promise<void> {
			const git = createGit(cwd, binary);
			await git.branch([force ? "-D" : "-d", name]);
		},

		async renameBranch(cwd: string, oldName: string, newName: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.branch(["-m", oldName, newName]);
		},

		async mergeBranch(cwd, source, opts): Promise<void> {
			const git = createGit(cwd, binary);
			const args: string[] = [source];
			if (opts?.noFf) args.unshift("--no-ff");
			if (opts?.squash) args.unshift("--squash");
			if (opts?.message) args.push("-m", opts.message);
			await git.merge(args);
		},

		async fetch(cwd, opts): Promise<FetchResultSummary> {
			const git = createGit(cwd, binary);
			const args: string[] = [];
			if (opts?.remote) args.push(opts.remote);
			if (opts?.prune) args.push("--prune");
			const result = await git.fetch(args);
			const updated = result.updated ?? [];
			const deleted = result.deleted ?? [];
			const branchRefs = updated.filter((u) => u.tracking?.includes("refs/remotes"));
			const tagRefs = updated.filter((u) => u.tracking?.includes("refs/tags"));
			return {
				branchesUpdated: branchRefs.length,
				tagsUpdated: tagRefs.length,
				refsDeleted: deleted.length,
				newBranchRefs: branchRefs.map((u) => u.tracking).filter(Boolean),
			};
		},

		async pull(cwd, opts): Promise<PullResultSummary> {
			const git = createGit(cwd, binary);
			const args: string[] = opts?.rebase ? ["--rebase"] : [];
			if (opts?.remote) args.push(opts.remote);
			if (opts?.branch) args.push(opts.branch);
			const result = await git.pull(args);
			const summary = result.summary ?? { changes: 0, insertions: 0, deletions: 0 };
			const behindHint = (opts as { behind?: number })?.behind ?? 0;
			return {
				commitsPulled: behindHint,
				filesChanged: summary.changes ?? 0,
				insertions: summary.insertions ?? 0,
				deletions: summary.deletions ?? 0,
			};
		},

		async push(cwd, opts): Promise<PushResultSummary> {
			const git = createGit(cwd, binary);
			const args: string[] = [];
			if (opts?.force) args.push("--force");
			if (opts?.setUpstream) args.push("-u");
			if (opts?.remote) args.push(opts.remote);
			if (opts?.branch) args.push(opts.branch);
			const result = await git.push(args);
			const aheadHint = (opts as { ahead?: number })?.ahead ?? 0;
			const refsPushed = result.pushed?.length ?? 0;
			return {
				commitsPushed: aheadHint > 0 ? aheadHint : refsPushed,
				refsPushed,
				branch: result.branch?.local,
			};
		},

		async listRemotes(cwd: string): Promise<RemoteInfo[]> {
			const git = createGit(cwd, binary);
			const remotes = await git.getRemotes(true);
			return remotes.map((r) => ({
				name: r.name,
				url: r.refs?.fetch ?? "",
				pushUrl: r.refs?.push,
			}));
		},

		async addRemote(cwd: string, name: string, url: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.addRemote(name, url);
		},

		async removeRemote(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.removeRemote(name);
		},

		async stash(cwd, opts): Promise<void> {
			const git = createGit(cwd, binary);
			await git.stash([
				"push",
				...(opts?.includeUntracked ? ["-u"] : []),
				...(opts?.message ? ["-m", opts.message] : []),
			]);
		},

		async stashPop(cwd: string, index?: number): Promise<void> {
			const git = createGit(cwd, binary);
			if (index != null) await git.stash(["pop", `stash@{${index}}`]);
			else await git.stash(["pop"]);
		},

		async stashApply(cwd: string, index?: number): Promise<void> {
			const git = createGit(cwd, binary);
			if (index != null) await git.stash(["apply", `stash@{${index}}`]);
			else await git.stash(["apply"]);
		},

		async stashList(cwd: string): Promise<StashEntry[]> {
			const git = createGit(cwd, binary);
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
			const git = createGit(cwd, binary);
			if (index != null) await git.stash(["drop", `stash@{${index}}`]);
			else await git.stash(["drop"]);
		},

		async stashShow(cwd: string, index: number): Promise<StashDetail | null> {
			const git = createGit(cwd, binary);
			const stashRef = `stash@{${index}}`;

			const [listOut, patchOut] = await Promise.all([
				git.raw(["stash", "list", "-1", stashRef, "--format=%H%n%s%n%an%n%ae%n%ai%n%D"]),
				git.raw(["stash", "show", "-p", stashRef]),
			]);

			const lines = listOut.trim().split("\n");
			if (lines.length < 5 || !lines[0]) return null;

			const oid = lines[0];
			const message = lines[1] ?? "";
			const authorName = lines[2] ?? "";
			const authorEmail = lines[3] ?? "";
			const date = lines[4] ?? "";

			const branchMatch = listOut.match(/On\s+(.+?):/);
			const branch = branchMatch?.[1] ?? "";

			return {
				index,
				message,
				oid,
				branch,
				author: { name: authorName, email: authorEmail },
				date,
				patch: patchOut,
			};
		},

		async listTags(cwd: string): Promise<string[]> {
			const git = createGit(cwd, binary);
			const tags = await git.tags();
			return tags.all;
		},

		async listTagsDetailed(cwd: string): Promise<TagInfo[]> {
			const git = createGit(cwd, binary);
			// %(refname:short) = tag name
			// %(*objectname) = peeled OID (commit for annotated tags; empty for lightweight)
			// %(objectname) = direct OID (commit for lightweight tags)
			const out = (await git.raw([
				"for-each-ref",
				"refs/tags",
				"--format=%(refname:short) %(*objectname) %(objectname)",
			])) as string;
			const lines = out.trim().split("\n").filter(Boolean);
			const result: { name: string; oid: string }[] = [];
			for (const line of lines) {
				const parts = line.trim().split(/\s+/);
				if (parts.length < 2) continue;
				const [name, peeled, direct] = parts as [
					string,
					string | undefined,
					string | undefined,
				];
				// Use peeled OID if present (annotated tag), else direct (lightweight tag)
				const oid = (peeled && peeled.length === 40 ? peeled : direct) ?? "";
				if (oid) result.push({ name, oid });
			}
			return result;
		},

		async createTag(cwd, name, opts): Promise<void> {
			const git = createGit(cwd, binary);
			const args: string[] = [name];
			if (opts?.message) args.push("-m", opts.message);
			if (opts?.ref) args.push(opts.ref);
			if (opts?.sign) args.push("-s");
			await git.tag(args);
		},

		async deleteTag(cwd: string, name: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.tag(["-d", name]);
		},

		async rebase(cwd: string, opts: { onto: string }): Promise<void> {
			const git = createGit(cwd, binary);
			await git.rebase([opts.onto]);
		},

		async rebaseAbort(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.rebase(["--abort"]);
		},

		async rebaseContinue(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.rebase(["--continue"]);
		},

		async rebaseSkip(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.rebase(["--skip"]);
		},

		async cherryPick(cwd: string, refs: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.raw(["cherry-pick", ...refs]);
		},

		async cherryPickAbort(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.raw(["cherry-pick", "--abort"]);
		},

		async cherryPickContinue(cwd: string): Promise<void> {
			const git = createGit(cwd, binary);
			await git.raw(["cherry-pick", "--continue"]);
		},

		async getConflictFiles(cwd: string): Promise<string[]> {
			const git = createGit(cwd, binary);
			const out = (await git.raw(["diff", "--name-only", "--diff-filter=U"])) as string;
			return out
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
		},

		async markResolved(cwd: string, paths: string[]): Promise<void> {
			const git = createGit(cwd, binary);
			await git.add(paths);
		},

		async listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
			const git = createGit(cwd, binary);
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
			const git = createGit(repoPath, binary);
			if (newBranch) {
				await git.raw(["worktree", "add", "-b", newBranch, worktreePath, branch]);
			} else {
				await git.raw(["worktree", "add", worktreePath, branch]);
			}
		},

		async removeWorktree(
			repoPath: string,
			worktreePath: string,
			force?: boolean
		): Promise<void> {
			const git = createGit(repoPath, binary);
			const args = ["worktree", "remove", worktreePath];
			if (force) args.splice(2, 0, "--force");
			await git.raw(args);
		},

		async pruneWorktrees(repoPath: string): Promise<void> {
			const git = createGit(repoPath, binary);
			await git.raw(["worktree", "prune"]);
		},
	};
}
