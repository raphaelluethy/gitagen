import { useState, useEffect } from "react";
import { FolderTree, ChevronDown, Check } from "lucide-react";
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
				className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] outline-none transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
				title="Switch worktree"
			>
				<FolderTree size={14} className="text-[var(--text-primary)]" />
				<code className="max-w-[100px] truncate font-mono">{displayName}</code>
				<ChevronDown
					size={12}
					className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
					<div className="dropdown animate-scale-in absolute left-0 top-full z-50 mt-1 max-h-72 w-80 overflow-auto">
						<div className="border-b border-[var(--border-secondary)] px-4 py-2">
							<p className="section-title">Worktrees</p>
						</div>
						{worktrees.map((w) => {
							const name = w.name ?? w.path.split("/").pop() ?? w.path;
							const isActive = w.path === currentPath;
							return (
								<button
									key={w.path}
									type="button"
									onClick={() => handleSwitch(w.path)}
									className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] outline-none transition-colors ${
										isActive
											? "bg-[var(--bg-active)] font-medium text-[var(--text-primary)]"
											: "hover:bg-[var(--bg-hover)]"
									}`}
								>
									<span
										className={`w-4 shrink-0 ${isActive ? "text-[var(--text-primary)]" : "invisible"}`}
									>
										<Check size={14} />
									</span>
									<div className="min-w-0 flex-1">
										<p
											className={`truncate font-mono text-xs ${
												isActive
													? "font-medium text-[var(--text-primary)]"
													: "text-[var(--text-secondary)]"
											}`}
										>
											{name}
										</p>
										<p className="truncate font-mono text-[10px] text-[var(--text-muted)]">
											{w.branch}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
