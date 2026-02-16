import { useState, useEffect } from "react";
import { FolderTree, ChevronDown } from "lucide-react";
import type { WorktreeInfo } from "../../../shared/types";

interface WorktreeSelectorProps {
	projectId: string;
	activeWorktreePath: string | null;
	mainRepoPath: string;
	onWorktreeChange: () => void;
}

export default function WorktreeSelector({
	projectId,
	activeWorktreePath,
	mainRepoPath,
	onWorktreeChange,
}: WorktreeSelectorProps) {
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		window.gitagen.repo.listWorktrees(projectId).then(setWorktrees);
	}, [projectId, activeWorktreePath]);

	const currentPath = activeWorktreePath || mainRepoPath;
	const current = worktrees.find((w) => w.path === currentPath);
	const displayName = current
		? (current.name ?? current.path.split("/").pop() ?? "main")
		: "main";

	const handleSwitch = (path: string) => {
		if (path === currentPath) {
			setOpen(false);
			return;
		}
		// Use null for main worktree
		const value = path === mainRepoPath ? null : path;
		window.gitagen.settings.setProjectPrefs(projectId, {
			activeWorktreePath: value,
		});
		onWorktreeChange();
		setOpen(false);
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
				title="Switch worktree"
			>
				<FolderTree size={14} />
				<span className="max-w-[100px] truncate">{displayName}</span>
				<ChevronDown size={12} className={open ? "rotate-180" : ""} />
			</button>
			{open && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
					<div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-64 overflow-auto rounded border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
						{worktrees.map((w) => {
							const name = w.name ?? w.path.split("/").pop() ?? w.path;
							const isActive = w.path === currentPath;
							return (
								<button
									key={w.path}
									type="button"
									onClick={() => handleSwitch(w.path)}
									className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
										isActive
											? "bg-zinc-100 font-medium dark:bg-zinc-800"
											: "hover:bg-zinc-50 dark:hover:bg-zinc-800"
									}`}
								>
									<span className="truncate">{name}</span>
									<span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
										{w.branch}
									</span>
								</button>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
