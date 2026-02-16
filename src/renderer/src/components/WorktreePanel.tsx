import { useState, useEffect, useCallback } from "react";
import { GitBranchPlus, Trash2, Check } from "lucide-react";
import type { AddWorktreeResult, BranchInfo, WorktreeInfo } from "../../../shared/types";
import { useToast } from "../toast/provider";

interface WorktreePanelProps {
	projectId: string;
	projectName: string;
	projectPath: string;
	currentBranch: string;
	activeWorktreePath: string | null;
	onRefresh: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim() !== "") {
		return error.message;
	}
	return fallback;
}

export default function WorktreePanel({
	projectId,
	projectName: _projectName,
	projectPath: _projectPath,
	currentBranch,
	activeWorktreePath,
	onRefresh,
}: WorktreePanelProps) {
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [showAddForm, setShowAddForm] = useState(false);
	const [addBranch, setAddBranch] = useState("");
	const [copyGitIgnores, setCopyGitIgnores] = useState(false);
	const [pruning, setPruning] = useState(false);
	const [removingPath, setRemovingPath] = useState<string | null>(null);
	const { toast } = useToast();

	const isModifiedWorktreeError = (error: unknown): boolean => {
		const message = getErrorMessage(error, "").toLowerCase();
		return (
			message.includes("contains modified or untracked files") ||
			message.includes("contains local changes") ||
			message.includes("use --force")
		);
	};

	const isBranchAlreadyCheckedOutError = (error: unknown): boolean => {
		const message = getErrorMessage(error, "").toLowerCase();
		return (
			message.includes("already checked out at") || message.includes("is already checked out")
		);
	};

	const suggestWorktreeBranchName = (
		baseBranch: string,
		existingBranches: Set<string>
	): string => {
		let candidate = `${baseBranch}-worktree`;
		let suffix = 2;
		while (existingBranches.has(candidate)) {
			candidate = `${baseBranch}-worktree-${suffix}`;
			suffix += 1;
		}
		return candidate;
	};

	const getWorktreeName = (path: string): string => {
		return worktrees.find((w) => w.path === path)?.name ?? path.split("/").pop() ?? path;
	};

	const loadWorktrees = useCallback(async () => {
		setLoading(true);
		try {
			const next = await window.gitagen.repo.listWorktrees(projectId);
			setWorktrees(next);
		} catch (error) {
			toast(`Failed to load worktrees: ${getErrorMessage(error, "Unknown error.")}`);
		} finally {
			setLoading(false);
		}
	}, [projectId, toast]);

	useEffect(() => {
		void loadWorktrees();
	}, [loadWorktrees, onRefresh]);

	const openAddForm = () => {
		const defaultBranch = currentBranch || "main";
		setAddBranch(defaultBranch);
		setCopyGitIgnores(false);
		setShowAddForm(true);
	};

	const handleAdd = async () => {
		const requestedBranch = addBranch.trim();
		if (!requestedBranch) {
			toast("Enter a branch name.");
			return;
		}
		setAdding(true);
		try {
			const branches: BranchInfo[] = await window.gitagen.repo.listBranches(projectId);
			const existingBranchNames = new Set(branches.map((b) => b.name));
			const currentLocalBranch =
				currentBranch || branches.find((b) => b.current)?.name || "HEAD";
			let baseBranch = requestedBranch;
			let newBranch: string | undefined;

			if (!existingBranchNames.has(requestedBranch)) {
				const shouldCreate = await window.gitagen.app.confirm({
					title: "Create Branch",
					message: `Branch "${requestedBranch}" does not exist.`,
					detail: `Create it from "${currentLocalBranch}" and use it in the new worktree?`,
					confirmLabel: "Create Branch",
					cancelLabel: "Cancel",
				});
				if (!shouldCreate) {
					toast("Worktree creation canceled.");
					return;
				}
				baseBranch = currentLocalBranch;
				newBranch = requestedBranch;
			}

			let result: AddWorktreeResult;
			try {
				result = await window.gitagen.repo.addWorktree(projectId, baseBranch, {
					newBranch,
					copyGitIgnores,
				});
			} catch (error) {
				if (!newBranch && isBranchAlreadyCheckedOutError(error)) {
					const suggested = suggestWorktreeBranchName(
						requestedBranch,
						existingBranchNames
					);
					const shouldUseSuggested = await window.gitagen.app.confirm({
						title: "Branch Already Checked Out",
						message: `Branch "${requestedBranch}" is already checked out in another worktree.`,
						detail: `Create a new branch "${suggested}" from "${requestedBranch}" for this worktree?`,
						confirmLabel: "Use Suggested Branch",
						cancelLabel: "Cancel",
					});
					if (!shouldUseSuggested) {
						toast("Worktree creation canceled.");
						return;
					}
					result = await window.gitagen.repo.addWorktree(projectId, requestedBranch, {
						newBranch: suggested,
						copyGitIgnores,
					});
					newBranch = suggested;
				} else {
					throw error;
				}
			}

			await loadWorktrees();
			onRefresh();
			setShowAddForm(false);
			const checkedOutBranch = newBranch ?? requestedBranch;
			if (copyGitIgnores) {
				if (result.copyGitignoreError) {
					toast(
						`Worktree "${checkedOutBranch}" created, but .gitignore copy failed: ${result.copyGitignoreError}`
					);
				} else {
					const count = result.copiedGitignoreCount;
					toast(
						`Worktree "${checkedOutBranch}" created. Copied ${count} .gitignore file${count === 1 ? "" : "s"}.`
					);
				}
			} else {
				toast(`Worktree "${checkedOutBranch}" created.`);
			}
		} catch (error) {
			toast(`Failed to add worktree: ${getErrorMessage(error, "Unknown error.")}`);
		} finally {
			setAdding(false);
		}
	};

	const handlePrune = async () => {
		const shouldPrune = await window.gitagen.app.confirm({
			title: "Clean Worktrees",
			message: "Clean up stale worktrees?",
			confirmLabel: "Clean",
			cancelLabel: "Cancel",
		});
		if (!shouldPrune) return;
		setPruning(true);
		try {
			await window.gitagen.repo.pruneWorktrees(projectId);
			await loadWorktrees();
			onRefresh();
			toast("Stale worktrees cleaned up.");
		} catch (error) {
			toast(`Failed to clean worktrees: ${getErrorMessage(error, "Unknown error.")}`);
		} finally {
			setPruning(false);
		}
	};

	const handleRemove = async (path: string) => {
		const name = getWorktreeName(path);
		const shouldRemove = await window.gitagen.app.confirm({
			title: "Remove Worktree",
			message: `Remove worktree "${name}"?`,
			detail: path,
			confirmLabel: "Remove",
			cancelLabel: "Cancel",
		});
		if (!shouldRemove) return;
		setRemovingPath(path);
		try {
			await window.gitagen.repo.removeWorktree(projectId, path);
			setWorktrees((prev) => prev.filter((w) => w.path !== path));
			onRefresh();
			toast("Worktree removed.");
		} catch (error) {
			if (isModifiedWorktreeError(error)) {
				const message = getErrorMessage(error, "Worktree contains local changes.");
				const shouldForce = await window.gitagen.app.confirm({
					title: "Force Remove Worktree",
					message: "Worktree contains local changes.",
					detail: `${message}\n\nForce removal will discard uncommitted changes.`,
					confirmLabel: "Force Remove",
					cancelLabel: "Cancel",
				});
				if (!shouldForce) {
					toast("Worktree removal canceled.");
					return;
				}
				try {
					await window.gitagen.repo.removeWorktree(projectId, path, true);
					setWorktrees((prev) => prev.filter((w) => w.path !== path));
					onRefresh();
					toast("Worktree removed (forced).");
					return;
				} catch (forceError) {
					toast(
						`Failed to force remove worktree: ${getErrorMessage(forceError, "Unknown error.")}`
					);
					return;
				}
			}

			toast(`Failed to remove worktree: ${getErrorMessage(error, "Unknown error.")}`);
		} finally {
			setRemovingPath(null);
		}
	};

	if (loading) {
		return <div className="p-3 text-xs text-(--text-muted)">Loading worktrees...</div>;
	}

	return (
		<div className="px-2 py-2">
			<div className="mb-1.5 flex items-center justify-between px-1">
				<span className="section-title">Worktrees</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handlePrune}
						disabled={pruning}
						className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary) disabled:opacity-50"
						title="Clean up stale worktrees"
					>
						Clean
					</button>
					<button
						type="button"
						onClick={openAddForm}
						disabled={adding}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary) disabled:opacity-50"
						title="Add worktree"
					>
						<GitBranchPlus size={11} />
						Add
					</button>
				</div>
			</div>
			{showAddForm && (
				<div className="mb-2 rounded-md border border-(--border-secondary) bg-(--bg-secondary) p-2">
					<label className="mb-1 block text-[10px] font-medium text-(--text-muted)">
						Branch
					</label>
					<input
						type="text"
						value={addBranch}
						onChange={(e) => setAddBranch(e.target.value)}
						placeholder="feature/my-worktree"
						className="input mb-2 h-8 text-xs"
						disabled={adding}
					/>
					<label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-(--text-secondary)">
						<input
							type="checkbox"
							checked={copyGitIgnores}
							onChange={(e) => setCopyGitIgnores(e.target.checked)}
							disabled={adding}
						/>
						Copy .gitignore files into the new worktree
					</label>
					<div className="flex items-center justify-end gap-1.5">
						<button
							type="button"
							onClick={() => setShowAddForm(false)}
							disabled={adding}
							className="btn btn-secondary h-7 px-2 text-[11px]"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => void handleAdd()}
							disabled={adding}
							className="btn btn-primary h-7 px-2 text-[11px]"
						>
							{adding ? "Creating..." : "Create"}
						</button>
					</div>
				</div>
			)}
			<div className="space-y-0.5">
				{worktrees.map((w) => {
					const name = w.name ?? w.path.split("/").pop();
					const isActive =
						(activeWorktreePath && w.path === activeWorktreePath) ||
						(!activeWorktreePath && w.isMainWorktree);
					return (
						<div
							key={w.path}
							className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
								isActive ? "bg-(--bg-active)" : "hover:bg-(--bg-hover)"
							}`}
						>
							<span
								className={`shrink-0 ${isActive ? "text-(--text-muted)" : "invisible"}`}
							>
								<Check size={11} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[11px] font-medium text-(--text-primary)">
									{name}
								</p>
								<p className="truncate text-[10px] text-(--text-subtle)">
									{w.branch}
								</p>
							</div>
							<div className="flex shrink-0 gap-0.5">
								{!isActive && (
									<button
										type="button"
										onClick={() => {
											window.gitagen.settings.setProjectPrefs(projectId, {
												activeWorktreePath: w.path,
											});
											onRefresh();
										}}
										className="rounded px-1.5 py-0.5 text-[10px] text-(--text-muted) outline-none hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
									>
										Switch
									</button>
								)}
								{!w.isMainWorktree && (
									<button
										type="button"
										onClick={() => void handleRemove(w.path)}
										disabled={removingPath === w.path}
										className="rounded p-0.5 text-(--text-muted) outline-none hover:bg-(--danger-bg) hover:text-(--danger)"
										title="Remove worktree"
									>
										<Trash2 size={11} />
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
