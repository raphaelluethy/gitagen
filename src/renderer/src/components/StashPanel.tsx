import { useState, useEffect } from "react";
import { Archive, Inbox, ArrowDownToLine, Trash2 } from "lucide-react";
import type { StashEntry } from "../../../shared/types";

interface StashPanelProps {
	projectId: string;
	onRefresh: () => void;
}

export default function StashPanel({ projectId, onRefresh }: StashPanelProps) {
	const [entries, setEntries] = useState<StashEntry[]>([]);
	const [loading, setLoading] = useState(true);

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
		} catch {
			// ignore
		}
	};

	const handleApply = async (index?: number) => {
		try {
			await window.gitagen.repo.stashApply(projectId, index);
			onRefresh();
		} catch {
			// ignore
		}
	};

	const handleDrop = async (index?: number) => {
		try {
			await window.gitagen.repo.stashDrop(projectId, index);
			onRefresh();
		} catch {
			// ignore
		}
	};

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-primary)] border-t-[var(--text-muted)]" />
				<p className="text-sm text-[var(--text-muted)]">Loading stash...</p>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
				<Archive size={28} className="text-[var(--border-primary)]" />
				<div>
					<p className="text-sm font-medium text-[var(--text-muted)]">No stash entries</p>
					<p className="mt-1 text-xs text-[var(--text-subtle)]">
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
					className="mb-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-3 transition-colors hover:bg-[var(--bg-hover)]"
				>
					<p className="truncate text-sm font-medium text-[var(--text-primary)]">
						{e.message}
					</p>
					<p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
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
							className="btn btn-ghost px-3 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
						>
							<Trash2 size={12} />
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
