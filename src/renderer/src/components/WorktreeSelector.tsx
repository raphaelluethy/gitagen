import { useState, useEffect } from "react";
import { FolderTree, ChevronDown, Check } from "lucide-react";
import type { WorktreeInfo } from "../../../shared/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore } from "../stores/repoStore";

export default function WorktreeSelector() {
	const activeProject = useProjectStore((s) => s.activeProject);
	const activeWorktreePath = useRepoStore((s) => s.activeWorktreePath);
	const projectId = activeProject?.id ?? "";
	const mainRepoPath = activeProject?.path ?? "";
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		let cancelled = false;
		window.gitagen.repo.listWorktrees(projectId).then((worktrees) => {
			if (!cancelled) setWorktrees(worktrees);
		});
		return () => {
			cancelled = true;
		};
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
		void useRepoStore.getState().refreshStatus();
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-(--text-secondary) outline-none transition-all hover:bg-(--bg-hover) hover:text-(--text-primary)"
					title="Switch worktree"
				>
					<FolderTree size={14} className="text-(--text-primary)" />
					<code className="max-w-[100px] truncate font-mono">{displayName}</code>
					<ChevronDown
						size={12}
						className={`shrink-0 text-(--text-muted) transition-transform duration-150 ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent className="max-h-72 w-80 overflow-auto" align="start">
				<div className="border-b border-(--border-secondary) px-4 py-2">
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
									? "bg-(--bg-active) font-medium text-(--text-primary)"
									: "hover:bg-(--bg-hover)"
							}`}
						>
							<span
								className={`w-4 shrink-0 ${isActive ? "text-(--text-primary)" : "invisible"}`}
							>
								<Check size={14} />
							</span>
							<div className="min-w-0 flex-1">
								<p
									className={`truncate font-mono text-xs ${
										isActive
											? "font-medium text-(--text-primary)"
											: "text-(--text-secondary)"
									}`}
								>
									{name}
								</p>
								<p className="truncate font-mono text-[10px] text-(--text-muted)">
									{w.branch}
								</p>
							</div>
						</button>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
