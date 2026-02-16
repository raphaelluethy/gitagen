import { useState, useEffect } from "react";
import { Upload, Download, RefreshCw, Cloud, Link } from "lucide-react";
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
		<div className="flex flex-col gap-4 p-3">
			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleFetch}
					disabled={loading || remotes.length === 0}
					className="btn btn-secondary flex-1 text-xs"
					title="Fetch from remote"
				>
					<RefreshCw size={12} className={loading ? "animate-spin" : ""} />
					Fetch
				</button>
				<button
					type="button"
					onClick={handlePull}
					disabled={loading || remotes.length === 0}
					className="btn btn-secondary flex-1 text-xs"
					title="Pull from remote"
				>
					<Download size={12} />
					Pull
				</button>
				<button
					type="button"
					onClick={handlePush}
					disabled={loading || remotes.length === 0}
					className="btn btn-primary flex-1 text-xs"
					title="Push to remote"
				>
					<Upload size={12} />
					Push
				</button>
			</div>
			{remotes.length > 0 ? (
				<div className="space-y-2">
					{remotes.map((r) => (
						<div
							key={r.name}
							className="rounded-lg border border-(--border-secondary) bg-(--bg-secondary) px-3 py-3 transition-colors hover:bg-(--bg-hover)"
						>
							<div className="flex items-center gap-2">
								<Link size={12} className="text-(--text-muted)" />
								<p className="text-xs font-semibold text-(--text-primary)">
									{r.name}
								</p>
							</div>
							<p className="mt-1 truncate font-mono text-[10px] text-(--text-muted)">
								{r.url}
							</p>
						</div>
					))}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
					<Cloud size={28} className="text-(--border-primary)" />
					<div>
						<p className="text-sm font-medium text-(--text-muted)">
							No remotes configured
						</p>
						<p className="mt-1 text-xs text-(--text-subtle)">
							Add a remote to sync with GitHub, GitLab, etc.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
