import { useState, useEffect } from "react";
import type { CommitInfo } from "../../../shared/types";

interface LogPanelProps {
	projectId: string;
}

export default function LogPanel({ projectId }: LogPanelProps) {
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		window.gitagen.repo
			.getLog(projectId, { limit: 50 })
			.then(setCommits)
			.finally(() => setLoading(false));
	}, [projectId]);

	if (loading) {
		return (
			<div className="flex items-center justify-center p-4 text-sm text-zinc-500">
				Loading history...
			</div>
		);
	}

	return (
		<div className="overflow-auto p-2">
			{commits.map((c) => (
				<div
					key={c.oid}
					className="border-b border-zinc-200 py-2 last:border-0 dark:border-zinc-700"
				>
					<p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
						{c.message.split("\n")[0]}
					</p>
					<p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
						{c.author.name} · {c.oid.slice(0, 7)}
						{c.signed && " ✓"}
					</p>
				</div>
			))}
		</div>
	);
}
