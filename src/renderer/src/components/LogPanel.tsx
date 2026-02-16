import { useState, useEffect } from "react";
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
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-primary)] border-t-[var(--text-muted)]" />
				<p className="text-sm text-[var(--text-muted)]">Loading history...</p>
			</div>
		);
	}

	if (commits.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
				<GitCommit size={24} className="text-[var(--border-primary)]" />
				<div>
					<p className="text-sm font-medium text-[var(--text-muted)]">No commits yet</p>
					<p className="mt-1 text-xs text-[var(--text-subtle)]">
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
					className={`group border-b border-[var(--border-secondary)] px-4 py-3 transition-colors ${
						idx === 0
							? "border-l-2 border-l-[var(--text-muted)] bg-[var(--bg-hover)]"
							: "hover:bg-[var(--bg-hover)]"
					}`}
				>
					<p className="truncate text-[13px] font-medium leading-snug text-[var(--text-primary)]">
						{c.message.split("\n")[0]}
					</p>
					<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
						<code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
							{c.oid.slice(0, 7)}
						</code>
						<span className="text-[var(--border-primary)]">·</span>
						<span className="text-[var(--text-secondary)]">{c.author.name}</span>
						<span className="text-[var(--border-primary)]">·</span>
						<span>{formatRelativeTime(new Date(c.author.date))}</span>
						{c.signed && (
							<>
								<span className="text-[var(--border-primary)]">·</span>
								<span className="flex items-center gap-1 text-[var(--text-muted)]">
									<Shield size={10} />
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
