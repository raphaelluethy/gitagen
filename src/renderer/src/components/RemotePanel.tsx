import { useState, useEffect } from "react";
import { Upload, Download, RefreshCw } from "lucide-react";
import type { RemoteInfo } from "../../../shared/types";

interface RemotePanelProps {
	projectId: string;
	onRefresh: () => void;
}

export default function RemotePanel({ projectId, onRefresh }: RemotePanelProps) {
	const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		window.gitagen.repo.listRemotes(projectId).then(setRemotes);
	}, [projectId]);

	const handleFetch = async () => {
		setLoading(true);
		try {
			await window.gitagen.repo.fetch(projectId, { prune: true });
			onRefresh();
		} finally {
			setLoading(false);
		}
	};

	const handlePull = async () => {
		setLoading(true);
		try {
			await window.gitagen.repo.pull(projectId);
			onRefresh();
		} finally {
			setLoading(false);
		}
	};

	const handlePush = async () => {
		setLoading(true);
		try {
			await window.gitagen.repo.push(projectId);
			onRefresh();
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 p-2">
			<div className="flex gap-1">
				<button
					type="button"
					onClick={handleFetch}
					disabled={loading || remotes.length === 0}
					className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium bg-zinc-200 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
					title="Fetch"
				>
					<RefreshCw size={12} />
					Fetch
				</button>
				<button
					type="button"
					onClick={handlePull}
					disabled={loading || remotes.length === 0}
					className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium bg-zinc-200 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
					title="Pull"
				>
					<Download size={12} />
					Pull
				</button>
				<button
					type="button"
					onClick={handlePush}
					disabled={loading || remotes.length === 0}
					className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium bg-zinc-200 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
					title="Push"
				>
					<Upload size={12} />
					Push
				</button>
			</div>
			{remotes.length > 0 && (
				<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
					{remotes.map((r) => (
						<div key={r.name}>
							{r.name}: {r.url}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
