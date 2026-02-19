import { useState, useEffect, useRef } from "react";
import { ArrowLeft, GitBranch, Inbox, ArrowDownToLine, Trash2 } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { StashDetail } from "../../../shared/types";
import { useThemeStore } from "../stores/themeStore";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore } from "../stores/repoStore";
import { useUIStore } from "../stores/uiStore";
import { splitPatchByFile } from "../utils/split-patch";
import { changeTypeColorClass } from "../utils/status-badge";
import { useToast } from "../toast/provider";

function formatDate(dateStr: string): { absolute: string; relative: string } {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);
	const hours = Math.floor((diff % 86400000) / 3600000);
	const minutes = Math.floor((diff % 3600000) / 60000);

	let relative: string;
	if (days > 7) relative = date.toLocaleDateString();
	else if (days > 0) relative = `${days}d ago`;
	else if (hours > 0) relative = `${hours}h ago`;
	else if (minutes > 0) relative = `${minutes}m ago`;
	else relative = "just now";

	return {
		absolute: date.toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}),
		relative,
	};
}

function detectChangeType(patch: string): string {
	if (patch.includes("new file mode")) return "A";
	if (patch.includes("deleted file mode")) return "D";
	if (patch.includes("rename from")) return "R";
	return "M";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

export default function StashDetailView() {
	const projectId = useProjectStore((s) => s.activeProject?.id ?? "");
	const index = useUIStore((s) => s.selectedStashIndex);
	const diffStyle = useUIStore((s) => s.diffStyle);
	const onClose = () => useUIStore.getState().setSelectedStashIndex(null);
	const onActionComplete = () => {
		void useRepoStore.getState().refreshStatus();
		useUIStore.getState().incrementStashRefreshKey();
	};
	const resolved = useThemeStore((s) => s.resolved);
	if (index === null) return null;
	const { toast } = useToast();
	const [detail, setDetail] = useState<StashDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState<string | null>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setLoading(true);
		window.gitagen.repo
			.stashShow(projectId, index)
			.then((stashDetail) => {
				if (requestIdRef.current !== requestId) return;
				setDetail(stashDetail ?? null);
			})
			.finally(() => {
				if (requestIdRef.current === requestId) setLoading(false);
			});
	}, [projectId, index]);

	const handlePop = async () => {
		if (!detail) return;
		setActionLoading("pop");
		try {
			await window.gitagen.repo.stashPop(projectId, detail.index);
			toast.success("Stash popped");
			onActionComplete();
			onClose();
		} catch (error) {
			toast.error("Stash pop failed", getErrorMessage(error));
		} finally {
			setActionLoading(null);
		}
	};

	const handleApply = async () => {
		if (!detail) return;
		setActionLoading("apply");
		try {
			await window.gitagen.repo.stashApply(projectId, detail.index);
			toast.success("Stash applied");
			onActionComplete();
		} finally {
			setActionLoading(null);
		}
	};

	const handleDrop = async () => {
		if (!detail) return;
		setActionLoading("drop");
		try {
			await window.gitagen.repo.stashDrop(projectId, detail.index);
			toast.success("Stash entry dropped");
			onActionComplete();
			onClose();
		} catch (error) {
			toast.error("Stash drop failed", getErrorMessage(error));
		} finally {
			setActionLoading(null);
		}
	};

	if (loading && !detail) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading stash...</p>
			</div>
		);
	}

	if (!detail) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
				<p className="text-sm text-(--text-muted)">Stash entry not found</p>
				<button
					type="button"
					onClick={onClose}
					className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					title="Back"
				>
					<ArrowLeft size={16} />
					<span>Back</span>
				</button>
			</div>
		);
	}

	const dateFormatted = formatDate(detail.date);
	const filePatches = splitPatchByFile(detail.patch);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-auto">
				<div className="flex flex-col">
					<div className="shrink-0 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-3">
						<div className="flex items-start gap-2">
							<button
								type="button"
								onClick={onClose}
								className="-ml-1 shrink-0 rounded p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
								title="Back to stash list"
							>
								<ArrowLeft size={16} />
							</button>
							<div className="min-w-0 flex-1">
								<h2 className="text-[15px] font-semibold leading-snug text-(--text-primary)">
									{detail.message || `stash@{${detail.index}}`}
								</h2>
								<button
									type="button"
									className="mt-1 cursor-pointer rounded font-mono text-[11px] text-(--text-muted) transition-colors hover:text-(--text-primary)"
									title="Copy stash ref"
									onClick={() => {
										navigator.clipboard.writeText(`stash@{${detail.index}}`);
										toast.success("Copied", `stash@{${detail.index}}`);
									}}
								>
									stash@{`{${detail.index}}`}
								</button>
							</div>
						</div>
						<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
							<div className="flex items-center gap-2">
								<GitBranch size={14} className="text-(--text-muted)" />
								<span className="text-[13px] text-(--text-secondary)">
									{detail.branch || "unknown"}
								</span>
							</div>
							<div className="flex items-center gap-2 text-[12px] text-(--text-muted)">
								<span title={dateFormatted.absolute}>{dateFormatted.relative}</span>
							</div>
							<div className="text-[11px] text-(--text-muted)">
								{detail.author.name} &lt;{detail.author.email}&gt;
							</div>
						</div>
						<div className="mt-4 flex gap-2">
							<button
								type="button"
								onClick={handlePop}
								disabled={actionLoading !== null}
								className="btn btn-secondary text-xs"
							>
								<Inbox size={12} />
								{actionLoading === "pop" ? "Popping..." : "Pop"}
							</button>
							<button
								type="button"
								onClick={handleApply}
								disabled={actionLoading !== null}
								className="btn btn-secondary text-xs"
							>
								<ArrowDownToLine size={12} />
								{actionLoading === "apply" ? "Applying..." : "Apply"}
							</button>
							<button
								type="button"
								onClick={handleDrop}
								disabled={actionLoading !== null}
								className="btn btn-ghost px-3 text-xs text-(--danger) hover:bg-(--danger-bg)"
							>
								<Trash2 size={12} />
								{actionLoading === "drop" ? "Dropping..." : "Drop"}
							</button>
						</div>
					</div>
					{filePatches.length === 0 ? (
						<div className="flex items-center justify-center p-8">
							<p className="text-sm text-(--text-muted)">No file changes</p>
						</div>
					) : (
						<div className="divide-y divide-(--border-secondary)">
							{filePatches.map(({ path, patch }) => {
								const changeType = detectChangeType(patch);
								return (
									<div key={path} className="bg-(--bg-primary)">
										<div className="flex items-center gap-2 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-2">
											<span
												className={`badge ${changeTypeColorClass(changeType)}`}
												title={changeType}
											>
												{changeType}
											</span>
											<span className="font-mono text-[13px] text-(--text-primary)">
												{path}
											</span>
										</div>
										<div className="[&_pre]:bg-transparent! [&_pre]:font-mono! [&_pre]:text-[13px]!">
											<PatchDiff
												patch={patch}
												options={{
													theme:
														resolved === "dark"
															? "github-dark"
															: "github-light",
													diffStyle,
													disableLineNumbers: false,
												}}
												className="min-h-0"
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
