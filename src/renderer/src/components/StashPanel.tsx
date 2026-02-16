import { useState, useEffect } from "react";
import { Archive } from "lucide-react";
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
		return <div className="p-2 text-xs text-zinc-500">Loading stash...</div>;
	}

	if (entries.length === 0) {
		return (
			<div className="flex items-center gap-2 p-3 text-xs text-zinc-500">
				<Archive size={14} />
				No stash entries
			</div>
		);
	}

	return (
		<div className="space-y-2 p-2">
			{entries.map((e) => (
				<div
					key={e.index}
					className="rounded border border-zinc-200 p-2 dark:border-zinc-700"
				>
					<p className="truncate text-xs font-medium dark:text-zinc-200">{e.message}</p>
					<p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
						stash@{`{${e.index}}`}
					</p>
					<div className="mt-2 flex gap-1">
						<button
							type="button"
							onClick={() => handlePop(e.index)}
							className="rounded px-2 py-0.5 text-[10px] bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
						>
							Pop
						</button>
						<button
							type="button"
							onClick={() => handleApply(e.index)}
							className="rounded px-2 py-0.5 text-[10px] bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
						>
							Apply
						</button>
						<button
							type="button"
							onClick={() => handleDrop(e.index)}
							className="rounded px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
						>
							Drop
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
