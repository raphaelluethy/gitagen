import { useState, useEffect } from "react";
import { Archive, Plus } from "lucide-react";
import type { StashEntry } from "../../../shared/types";
import { cn } from "../lib/cn";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";

export default function StashPanel() {
	const projectId = useProjectStore((s) => s.activeProject?.id ?? "");
	const selectedIndex = useUIStore((s) => s.selectedStashIndex);
	const onSelect = useUIStore((s) => s.setSelectedStashIndex);
	const onOpenCreateDialog = useUIStore((s) => s.showStashDialogOpen);
	const refreshKey = useUIStore((s) => s.stashRefreshKey);
	const [entries, setEntries] = useState<StashEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		window.gitagen.repo
			.stashList(projectId)
			.then(setEntries)
			.finally(() => setLoading(false));
	}, [projectId, refreshKey]);

	useEffect(() => {
		if (entries.length === 0 && selectedIndex !== null) {
			onSelect(null);
		} else if (selectedIndex !== null && !entries.some((e) => e.index === selectedIndex)) {
			onSelect(null);
		}
	}, [entries, selectedIndex, onSelect]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading stash...</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="shrink-0 border-b border-(--border-secondary) p-3">
				<button
					type="button"
					onClick={onOpenCreateDialog}
					className="btn btn-secondary w-full text-xs"
				>
					<Plus size={14} />
					Create Stash
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{entries.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
						<Archive size={28} className="text-(--border-primary)" />
						<div>
							<p className="text-sm font-medium text-(--text-muted)">
								No stash entries
							</p>
							<p className="mt-1 text-xs text-(--text-subtle)">
								Stash changes to save them for later
							</p>
						</div>
					</div>
				) : (
					<div className="p-2">
						{entries.map((e) => (
							<button
								key={e.index}
								type="button"
								onClick={() => onSelect(e.index)}
								className={cn(
									"mb-1 w-full rounded-lg border p-3 text-left transition-colors",
									selectedIndex === e.index
										? "border-(--accent-primary) bg-(--bg-active)"
										: "border-(--border-secondary) bg-(--bg-secondary) hover:bg-(--bg-hover)"
								)}
							>
								<p className="truncate text-sm font-medium text-(--text-primary)">
									{e.message || `stash@{${e.index}}`}
								</p>
								<p className="mt-1 font-mono text-[11px] text-(--text-muted)">
									stash@{`{${e.index}}`}
								</p>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
