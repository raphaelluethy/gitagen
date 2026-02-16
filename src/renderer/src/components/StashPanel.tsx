import { useState, useEffect } from "react";
import { Archive, Inbox, ArrowDownToLine, Trash2 } from "lucide-react";
import type { StashEntry } from "../../../shared/types";
import { useToast } from "../toast/provider";

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

interface StashPanelProps {
	projectId: string;
	onRefresh: () => void;
}

export default function StashPanel({ projectId, onRefresh }: StashPanelProps) {
	const [entries, setEntries] = useState<StashEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const { toast } = useToast();

	useEffect(() => {
		setLoading(true);
		window.gitagen.repo
			.stashList(projectId)
			.then(setEntries)
			.finally(() => setLoading(false));
	}, [projectId, onRefresh]);

	const handlePop = async (index?: number) => {
		try {
			await window.gitagen.repo.stashPop(projectId, index);
			onRefresh();
			toast.success("Stash popped");
		} catch (error) {
			toast.error("Stash pop failed", getErrorMessage(error));
		}
	};

	const handleApply = async (index?: number) => {
		try {
			await window.gitagen.repo.stashApply(projectId, index);
			onRefresh();
			toast.success("Stash applied");
		} catch (error) {
			toast.error("Stash apply failed", getErrorMessage(error));
		}
	};

	const handleDrop = async (index?: number) => {
		try {
			await window.gitagen.repo.stashDrop(projectId, index);
			onRefresh();
			toast.success("Stash entry dropped");
		} catch (error) {
			toast.error("Stash drop failed", getErrorMessage(error));
		}
	};

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading stash...</p>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
				<Archive size={28} className="text-(--border-primary)" />
				<div>
					<p className="text-sm font-medium text-(--text-muted)">No stash entries</p>
					<p className="mt-1 text-xs text-(--text-subtle)">
						Stash changes to save them for later
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-3">
			{entries.map((e) => (
				<div
					key={e.index}
					className="mb-3 rounded-lg border border-(--border-secondary) bg-(--bg-secondary) p-3 transition-colors hover:bg-(--bg-hover)"
				>
					<p className="truncate text-sm font-medium text-(--text-primary)">
						{e.message}
					</p>
					<p className="mt-1 font-mono text-[11px] text-(--text-muted)">
						stash@{`{${e.index}}`}
					</p>
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => handlePop(e.index)}
							className="btn btn-secondary flex-1 text-xs"
						>
							<Inbox size={12} />
							Pop
						</button>
						<button
							type="button"
							onClick={() => handleApply(e.index)}
							className="btn btn-secondary flex-1 text-xs"
						>
							<ArrowDownToLine size={12} />
							Apply
						</button>
						<button
							type="button"
							onClick={() => handleDrop(e.index)}
							className="btn btn-ghost px-3 text-xs text-(--danger) hover:bg-(--danger-bg)"
						>
							<Trash2 size={12} />
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
