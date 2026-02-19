import { ChevronLeft, GitBranch, MoreHorizontal, RotateCcw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "../ui/dropdown-menu";

export interface SidebarHeaderProps {
	repoPath: string;
	totalChanges: number;
	onBack?: () => void;
	onDiscardAll: () => void;
}

export function SidebarHeader({
	repoPath,
	totalChanges,
	onBack,
	onDiscardAll,
}: SidebarHeaderProps) {
	return (
		<div className="flex items-center gap-2 border-b border-(--border-secondary) px-3 py-2.5">
			{onBack && (
				<button
					type="button"
					onClick={onBack}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					title="Back to projects"
				>
					<ChevronLeft size={16} />
				</button>
			)}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<GitBranch size={12} className="shrink-0 text-(--text-muted)" />
					<h2 className="section-title truncate">Changes</h2>
					{totalChanges > 0 && (
						<span className="ml-1 shrink-0 rounded-full bg-(--bg-tertiary) px-1.5 py-0.5 font-mono text-[10px] font-medium text-(--text-muted)">
							{totalChanges}
						</span>
					)}
				</div>
				<p
					className="mt-0.5 truncate font-mono text-[10px] text-(--text-subtle)"
					title={repoPath}
				>
					{repoPath}
				</p>
			</div>
			{totalChanges > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger
						asChild
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					>
						<button type="button" title="More actions">
							<MoreHorizontal size={16} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onDiscardAll} variant="destructive">
							<RotateCcw size={14} strokeWidth={2} />
							Discard All Changes
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
