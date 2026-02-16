import { useState, useEffect } from "react";
import { GitBranchPlus, Trash2, Check } from "lucide-react";
import type { WorktreeInfo } from "../../../shared/types";

interface WorktreePanelProps {
	projectId: string;
	projectName: string;
	projectPath: string;
	currentBranch: string;
	activeWorktreePath: string | null;
	onRefresh: () => void;
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
	const [pruning, setPruning] = useState(false);

	useEffect(() => {
		setLoading(true);
		window.gitagen.repo
			.listWorktrees(projectId)
			.then(setWorktrees)
			.finally(() => setLoading(false));
	}, [projectId, onRefresh]);

	const handleAdd = async () => {
		const defaultBranch = currentBranch || "main";
		const branch = prompt("Create worktree from branch:", defaultBranch)?.trim();
		if (!branch) return;
		setAdding(true);
		try {
			await window.gitagen.repo.addWorktree(projectId, branch, undefined);
			onRefresh();
		} catch {
			try {
				await window.gitagen.repo.addWorktree(projectId, "main", undefined);
				onRefresh();
			} catch {
				// ignore
			}
		} finally {
			setAdding(false);
		}
	};

	const handlePrune = async () => {
		if (!confirm("Clean up stale worktrees?")) return;
		setPruning(true);
		try {
			await window.gitagen.repo.pruneWorktrees(projectId);
			onRefresh();
		} catch {
			// ignore
		} finally {
			setPruning(false);
		}
	};

	const handleRemove = async (path: string) => {
		if (!confirm("Remove this worktree?")) return;
		try {
			await window.gitagen.repo.removeWorktree(projectId, path);
			onRefresh();
		} catch {
			// ignore
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
						onClick={handleAdd}
						disabled={adding}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary) disabled:opacity-50"
						title="Add worktree"
					>
						<GitBranchPlus size={11} />
						Add
					</button>
				</div>
			</div>
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
										onClick={() => handleRemove(w.path)}
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
