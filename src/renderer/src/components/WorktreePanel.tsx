import { useState, useEffect } from "react";
import { GitBranchPlus, Trash2 } from "lucide-react";
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
	projectName,
	projectPath,
	currentBranch,
	activeWorktreePath,
	onRefresh,
}: WorktreePanelProps) {
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);

	useEffect(() => {
		setLoading(true);
		window.gitagen.repo
			.listWorktrees(projectId)
			.then(setWorktrees)
			.finally(() => setLoading(false));
	}, [projectId, onRefresh]);

	const handleAdd = async () => {
		const branch = currentBranch || "main";
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
		return <div className="p-2 text-xs text-zinc-500">Loading worktrees...</div>;
	}

	return (
		<div className="p-2">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
					Worktrees
				</span>
				<button
					type="button"
					onClick={handleAdd}
					disabled={adding}
					className="flex items-center gap-1 rounded p-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
					title="Add worktree"
				>
					<GitBranchPlus size={12} />
					Add
				</button>
			</div>
			<div className="space-y-1">
				{worktrees.map((w) => {
					const name = w.name ?? w.path.split("/").pop();
					const isActive =
						(activeWorktreePath && w.path === activeWorktreePath) ||
						(!activeWorktreePath && w.isMainWorktree);
					return (
						<div
							key={w.path}
							className={`flex items-center justify-between gap-1 rounded border p-2 ${
								isActive
									? "border-zinc-400 bg-zinc-200/50 dark:border-zinc-500 dark:bg-zinc-800/50"
									: "border-zinc-200 dark:border-zinc-700"
							}`}
						>
							<div className="min-w-0 flex-1">
								<p className="truncate text-xs font-medium dark:text-zinc-200">
									{name}
								</p>
								<p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
									{w.branch}
								</p>
							</div>
							<div className="flex shrink-0 gap-1">
								{!isActive && (
									<button
										type="button"
										onClick={() => {
											window.gitagen.settings.setProjectPrefs(projectId, {
												activeWorktreePath: w.path,
											});
											onRefresh();
										}}
										className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
										title="Switch to this worktree"
									>
										Switch
									</button>
								)}
								{!w.isMainWorktree && (
									<button
										type="button"
										onClick={() => handleRemove(w.path)}
										className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
										title="Remove worktree"
									>
										<Trash2 size={12} />
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
