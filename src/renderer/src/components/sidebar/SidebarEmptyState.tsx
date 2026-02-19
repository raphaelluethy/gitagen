import { GitBranch } from "lucide-react";

export function SidebarEmptyState() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--bg-tertiary)">
				<GitBranch size={18} className="text-(--text-muted)" />
			</div>
			<div className="w-full text-center">
				<p className="text-xs font-medium text-(--text-muted)">No changes</p>
				<p className="mt-0.5 text-[11px] text-(--text-subtle)">Clean working directory</p>
			</div>
		</div>
	);
}
