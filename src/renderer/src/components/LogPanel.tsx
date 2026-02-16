import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpCircle, GitCommit, Loader2, RotateCcw, Shield } from "lucide-react";
import type { CommitInfo } from "../../../shared/types";
import { useToast } from "../toast/provider";

const ROW_HEIGHT = 80;
const OVERSCAN = 5;
const PAGE_SIZE = 25;

interface LogPanelProps {
	projectId: string;
	selectedOid?: string | null;
	onSelectCommit?: (oid: string) => void;
	/** Cached commits from openProject - shown instantly, no spinner */
	initialCommits?: CommitInfo[] | null;
	/** Cached unpushed OIDs for annotating initialCommits with pushed status */
	initialUnpushedOids?: string[] | null;
}

function annotateWithPushedStatus(
	commits: CommitInfo[],
	unpushedOids: Set<string> | null
): CommitInfo[] {
	if (unpushedOids === null) {
		return commits.map((c) => ({ ...c, pushed: false }));
	}
	return commits.map((c) => ({
		...c,
		pushed: !unpushedOids.has(c.oid),
	}));
}

/**
 * Merge fresh commits into an existing list.
 * Prepends any new commits that appear before the first overlap,
 * and replaces the tail with the fresh data so pushed/signed status
 * stays accurate while the scroll position is preserved.
 */
function mergeCommits(existing: CommitInfo[], fresh: CommitInfo[]): CommitInfo[] {
	if (existing.length === 0) return fresh;
	if (fresh.length === 0) return existing;

	const existingOids = new Set(existing.map((c) => c.oid));

	let overlapIdx = -1;
	for (let i = 0; i < fresh.length; i++) {
		if (existingOids.has(fresh[i]!.oid)) {
			overlapIdx = i;
			break;
		}
	}

	if (overlapIdx === -1) {
		return fresh;
	}

	const newCommits = fresh.slice(0, overlapIdx);
	const freshOids = new Set(fresh.map((c) => c.oid));
	const keptOld = existing.filter((c) => !freshOids.has(c.oid));

	return [...newCommits, ...fresh.slice(overlapIdx), ...keptOld];
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

export default function LogPanel({
	projectId,
	selectedOid,
	onSelectCommit,
	initialCommits,
	initialUnpushedOids,
}: LogPanelProps) {
	const { toast } = useToast();
	const [commits, setCommits] = useState<CommitInfo[]>([]);
	const [unpushedOids, setUnpushedOids] = useState<Set<string> | null>(null);
	const [loading, setLoading] = useState(true);
	const [showSpinner, setShowSpinner] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [undoing, setUndoing] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const loadingMoreRef = useRef(false);

	// Delay the spinner so cached data has time to arrive before any flash
	useEffect(() => {
		if (!loading || commits.length > 0) {
			setShowSpinner(false);
			return;
		}
		const timer = setTimeout(() => setShowSpinner(true), 100);
		return () => clearTimeout(timer);
	}, [loading, commits.length]);

	// Fetch the first page from git and merge into the current list
	const refreshFirstPage = useCallback(
		(opts?: { replace?: boolean }) => {
			Promise.all([
				window.gitagen.repo.getLog(projectId, { limit: PAGE_SIZE }),
				window.gitagen.repo.getUnpushedOids(projectId),
			])
				.then(([logData, oids]) => {
					const oidSet = oids === null ? null : new Set(oids);
					setUnpushedOids(oidSet);
					const annotated = annotateWithPushedStatus(logData, oidSet);
					if (opts?.replace) {
						setCommits(annotated);
					} else {
						setCommits((prev) => mergeCommits(prev, annotated));
					}
					setHasMore(logData.length >= PAGE_SIZE);
				})
				.catch(() => {})
				.finally(() => setLoading(false));
		},
		[projectId]
	);

	// Load the next page of commits (appended to the end)
	const loadNextPage = useCallback(() => {
		if (loadingMoreRef.current || !hasMore) return;
		loadingMoreRef.current = true;
		setLoadingMore(true);

		setCommits((prev) => {
			const offset = prev.length;
			window.gitagen.repo
				.getLog(projectId, { limit: PAGE_SIZE, offset })
				.then((page) => {
					if (page.length > 0) {
						const annotated = annotateWithPushedStatus(page, unpushedOids);
						setCommits((current) => {
							const existingOids = new Set(current.map((c) => c.oid));
							const newItems = annotated.filter((c) => !existingOids.has(c.oid));
							return [...current, ...newItems];
						});
					}
					setHasMore(page.length >= PAGE_SIZE);
				})
				.catch(() => {})
				.finally(() => {
					loadingMoreRef.current = false;
					setLoadingMore(false);
				});
			return prev;
		});
	}, [projectId, hasMore, unpushedOids]);

	const handleUndoLastCommit = useCallback(async () => {
		const first = commits[0];
		if (!first || first.pushed) return;
		const confirmed = await window.gitagen.app.confirm({
			title: "Undo Last Commit",
			message: "Are you sure you want to undo the last commit?",
			detail: "The changes will be kept as staged files. This cannot be undone.",
			confirmLabel: "Undo Commit",
			cancelLabel: "Cancel",
		});
		if (!confirmed) return;
		setUndoing(true);
		try {
			await window.gitagen.repo.undoLastCommit(projectId);
			toast.success("Last commit undone", "Changes are now staged");
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Undo failed", msg);
		} finally {
			setUndoing(false);
		}
	}, [projectId, commits, toast]);

	// On mount / initialCommits: show cached commits instantly (annotated with pushed status), then fetch first page in background
	useEffect(() => {
		setHasMore(true);
		const hasInitial = initialCommits != null && initialCommits.length > 0;
		if (hasInitial) {
			const oidSet =
				initialUnpushedOids && initialUnpushedOids.length > 0
					? new Set(initialUnpushedOids)
					: null;
			setUnpushedOids(oidSet);
			setCommits(annotateWithPushedStatus(initialCommits, oidSet));
			setLoading(false);
		} else {
			setCommits([]);
			setUnpushedOids(null);
			setLoading(true);
		}
		refreshFirstPage({ replace: !hasInitial });
	}, [projectId, initialCommits, initialUnpushedOids, refreshFirstPage]);

	// Refresh on repo events (push, commit, branch switch, etc.)
	useEffect(() => {
		const unsub = window.gitagen.events.onRepoUpdated(
			(payload: { projectId: string; updatedAt: number }) => {
				if (payload.projectId === projectId) refreshFirstPage();
			}
		);
		return () => {
			unsub();
		};
	}, [projectId, refreshFirstPage]);

	const rowVirtualizer = useVirtualizer({
		count: commits.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	// Infinite scroll: load next page when nearing the bottom
	const virtualItems = rowVirtualizer.getVirtualItems();
	const lastItem = virtualItems[virtualItems.length - 1];
	useEffect(() => {
		if (!lastItem) return;
		// Trigger when within 5 items of the end
		if (lastItem.index >= commits.length - 5 && hasMore && !loadingMoreRef.current) {
			loadNextPage();
		}
	}, [lastItem?.index, commits.length, hasMore, loadNextPage]);

	if (showSpinner && commits.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading history...</p>
			</div>
		);
	}

	if (!loading && commits.length === 0) {
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

	const canUndo = commits.length > 0 && commits[0]!.pushed === false;

	return (
		<div className="flex h-full flex-col">
			{canUndo && (
				<div className="flex items-center justify-between border-b border-(--border-secondary) px-3 py-1.5">
					<span className="text-[10px] text-(--text-muted)">
						Latest commit is unpushed
					</span>
					<button
						type="button"
						disabled={undoing}
						onClick={handleUndoLastCommit}
						className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-(--warning) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
					>
						<RotateCcw size={10} />
						{undoing ? "Undoing…" : "Undo"}
					</button>
				</div>
			)}
			<div ref={scrollRef} className="h-full overflow-auto -mx-1 px-1">
				<div
					style={{
						height: `${rowVirtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{virtualItems.map((virtualRow) => {
						const c = commits[virtualRow.index]!;
						const isSelected = selectedOid === c.oid;
						const isFirst = virtualRow.index === 0;
						const isUnpushed = c.pushed === false;
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
										: isUnpushed
											? "border-l-2 border-l-(--warning) hover:bg-(--bg-hover)"
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
								<div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-(--text-muted)">
									<code
										className="shrink-0 cursor-pointer rounded bg-(--bg-tertiary) px-1 py-px font-mono text-[10px] text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
										title="Copy commit hash"
										onClick={(e) => {
											e.stopPropagation();
											navigator.clipboard.writeText(c.oid);
											toast.success("Copied", c.oid.slice(0, 7));
										}}
									>
										{c.oid.slice(0, 7)}
									</code>
									{c.pushed === false ? (
										<span className="shrink-0 rounded bg-(--warning-bg) px-1.5 py-px font-medium text-(--warning)">
											local
										</span>
									) : (
										<span className="shrink-0 flex items-center gap-0.5 text-(--text-subtle)">
											<ArrowUpCircle size={10} />
											<span>pushed</span>
										</span>
									)}
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
				{loadingMore && (
					<div className="flex items-center justify-center py-3">
						<Loader2 size={14} className="animate-spin text-(--text-muted)" />
					</div>
				)}
			</div>
		</div>
	);
}
