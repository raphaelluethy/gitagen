import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitCommit, Shield } from "lucide-react";
import type { CommitInfo } from "../../../shared/types";

const ROW_HEIGHT = 80;
const OVERSCAN = 3;

interface LogPanelProps {
	projectId: string;
	selectedOid?: string | null;
	onSelectCommit?: (oid: string) => void;
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

export default function LogPanel({ projectId, selectedOid, onSelectCommit }: LogPanelProps) {
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

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

	const rowVirtualizer = useVirtualizer({
		count: commits.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

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
		<div ref={scrollRef} className="h-full overflow-auto -mx-1 px-1">
			<div
				style={{
					height: `${rowVirtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{rowVirtualizer.getVirtualItems().map((virtualRow) => {
					const c = commits[virtualRow.index]!;
					const isSelected = selectedOid === c.oid;
					const isFirst = virtualRow.index === 0;
					return (
						<div
							key={virtualRow.key}
							role="button"
							tabIndex={0}
							onClick={() => onSelectCommit?.(c.oid)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelectCommit?.(c.oid);
								}
							}}
							className={`absolute left-0 top-0 w-full cursor-pointer border-b border-(--border-secondary) px-3 py-2.5 transition-colors ${
								isSelected
									? "border-l-2 border-l-(--accent-primary) bg-(--bg-hover)"
									: isFirst
										? "border-l-2 border-l-(--text-muted) hover:bg-(--bg-hover)"
										: "border-l-2 border-l-transparent hover:bg-(--bg-hover)"
							}`}
							style={{
								height: `${virtualRow.size}px`,
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							<p className="truncate text-[12px] font-medium leading-snug text-(--text-primary)">
								{c.message.split("\n")[0]}
							</p>
							<div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-(--text-muted)">
								<code className="shrink-0 rounded bg-(--bg-tertiary) px-1 py-px font-mono text-[10px] text-(--text-muted)">
									{c.oid.slice(0, 7)}
								</code>
								<span className="truncate text-(--text-secondary)">
									{c.author.name}
								</span>
							</div>
							<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-(--text-subtle)">
								<span>{formatRelativeTime(new Date(c.author.date))}</span>
								{c.signed && (
									<>
										<span className="text-(--border-primary)">·</span>
										<span className="flex items-center gap-0.5 text-(--success)">
											<Shield size={9} />
											<span>signed</span>
										</span>
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
