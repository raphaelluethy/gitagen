import { useState, useEffect, useCallback } from "react";
import { GitCommit, Shield } from "lucide-react";
import type { CommitInfo } from "../../../shared/types";

interface LogPanelProps {
	projectId: string;
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 7) {
		return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
	if (days > 0) {
		return `${days}d ago`;
	}
	if (hours > 0) {
		return `${hours}h ago`;
	}
	if (minutes > 0) {
		return `${minutes}m ago`;
	}
	return "just now";
}

function fetchLog(projectId: string): Promise<CommitInfo[]> {
	return window.gitagen.repo.getLog(projectId, { limit: 50 });
}

export default function LogPanel({ projectId }: LogPanelProps) {
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [loading, setLoading] = useState(true);

	const loadCommits = useCallback(
		(opts?: { background?: boolean }) => {
			if (!opts?.background) setLoading(true);
			fetchLog(projectId)
				.then(setCommits)
				.finally(() => setLoading(false));
		},
		[projectId]
	);

	useEffect(() => {
		loadCommits();
	}, [loadCommits]);

	useEffect(() => {
		const unsub = window.gitagen.events.onRepoUpdated(
			(payload: { projectId: string; updatedAt: number }) => {
				if (payload.projectId === projectId) loadCommits({ background: true });
			}
		);
		return () => {
			unsub();
		};
	}, [projectId, loadCommits]);

	if (loading && commits.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading history...</p>
			</div>
		);
	}

	if (commits.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
				<GitCommit size={24} className="text-(--border-primary)" />
				<div>
					<p className="text-sm font-medium text-(--text-muted)">No commits yet</p>
					<p className="mt-1 text-xs text-(--text-subtle)">
						Make your first commit to see history
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="overflow-auto">
			{commits.map((c, idx) => (
				<div
					key={c.oid}
					className={`group border-b border-(--border-secondary) px-3 py-2.5 transition-colors ${
						idx === 0
							? "border-l-2 border-l-(--text-muted) bg-(--bg-hover)"
							: "hover:bg-(--bg-hover)"
					}`}
				>
					<p className="truncate text-[12px] font-medium leading-snug text-(--text-primary)">
						{c.message.split("\n")[0]}
					</p>
					<div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-(--text-muted)">
						<code className="shrink-0 rounded bg-(--bg-tertiary) px-1 py-px font-mono text-[10px] text-(--text-muted)">
							{c.oid.slice(0, 7)}
						</code>
						<span className="truncate text-(--text-secondary)">{c.author.name}</span>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-(--text-subtle)">
						<span>{formatRelativeTime(new Date(c.author.date))}</span>
						{c.signed && (
							<>
								<span className="text-(--border-primary)">·</span>
								<span className="flex items-center gap-0.5">
									<Shield size={9} />
									<span>signed</span>
								</span>
							</>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
