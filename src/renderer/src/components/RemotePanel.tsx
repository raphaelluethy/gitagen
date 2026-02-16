import { useState, useEffect } from "react";
import { Upload, Download, RefreshCw, Cloud, Loader2 } from "lucide-react";
import type { RemoteInfo } from "../../../shared/types";
import { useToast } from "../toast/provider";

interface RemotePanelProps {
	projectId: string;
	onRefresh: () => void;
}

function formatFetchToast(r: {
	branchesUpdated: number;
	tagsUpdated: number;
	refsDeleted: number;
}): { title: string; desc?: string } {
	const parts: string[] = [];
	if (r.branchesUpdated > 0)
		parts.push(`${r.branchesUpdated} branch${r.branchesUpdated === 1 ? "" : "es"}`);
	if (r.tagsUpdated > 0) parts.push(`${r.tagsUpdated} tag${r.tagsUpdated === 1 ? "" : "s"}`);
	if (r.refsDeleted > 0)
		parts.push(`${r.refsDeleted} ref${r.refsDeleted === 1 ? "" : "s"} pruned`);
	if (parts.length === 0) return { title: "Fetch complete", desc: "Already up to date" };
	return { title: "Fetched", desc: parts.join(", ") };
}

function formatPullToast(r: {
	commitsPulled: number;
	filesChanged: number;
	insertions: number;
	deletions: number;
}): { title: string; desc?: string } {
	if (r.commitsPulled > 0) {
		const desc =
			r.filesChanged > 0
				? `${r.filesChanged} file${r.filesChanged === 1 ? "" : "s"} changed (+${r.insertions}/-${r.deletions})`
				: undefined;
		return {
			title: `Pulled ${r.commitsPulled} commit${r.commitsPulled === 1 ? "" : "s"}`,
			desc,
		};
	}
	if (r.filesChanged > 0) {
		const desc = `+${r.insertions}/-${r.deletions}`;
		return { title: `${r.filesChanged} file${r.filesChanged === 1 ? "" : "s"} updated`, desc };
	}
	return { title: "Pull complete", desc: "Already up to date" };
}

function formatPushToast(r: { commitsPushed: number; refsPushed: number; branch?: string }): {
	title: string;
	desc?: string;
} {
	if (r.commitsPushed > 0)
		return {
			title: `Pushed ${r.commitsPushed} commit${r.commitsPushed === 1 ? "" : "s"}`,
			desc: r.branch ? `to ${r.branch}` : undefined,
		};
	return { title: "Push complete", desc: "Nothing to push" };
}

type LoadingOp = "fetch" | "pull" | "push" | null;

export default function RemotePanel({ projectId, onRefresh }: RemotePanelProps) {
	const { toast } = useToast();
	const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
	const [loadingOp, setLoadingOp] = useState<LoadingOp>(null);
	const loading = loadingOp !== null;

	useEffect(() => {
		let cancelled = false;
		window.gitagen.repo.listRemotes(projectId).then((remotes) => {
			if (!cancelled) setRemotes(remotes);
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const handleFetch = async () => {
		setLoadingOp("fetch");
		try {
			const result = await window.gitagen.repo.fetch(projectId, {
				prune: true,
			});
			onRefresh();
			const { title, desc } = formatFetchToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Fetch failed", error instanceof Error ? error.message : "Unknown error");
		} finally {
			setLoadingOp(null);
		}
	};

	const handlePull = async () => {
		setLoadingOp("pull");
		try {
			const result = await window.gitagen.repo.pull(projectId);
			onRefresh();
			const { title, desc } = formatPullToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Pull failed", error instanceof Error ? error.message : "Unknown error");
		} finally {
			setLoadingOp(null);
		}
	};

	const handlePush = async () => {
		setLoadingOp("push");
		try {
			const result = await window.gitagen.repo.push(projectId);
			onRefresh();
			const { title, desc } = formatPushToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Push failed", error instanceof Error ? error.message : "Unknown error");
		} finally {
			setLoadingOp(null);
		}
	};

	return (
		<div className="flex flex-col gap-4 p-3">
			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleFetch}
					disabled={loading || remotes.length === 0}
					className="btn btn-secondary flex items-center justify-center p-2"
					title="Fetch"
				>
					<RefreshCw size={14} className={loadingOp === "fetch" ? "animate-spin" : ""} />
				</button>
				<button
					type="button"
					onClick={handlePull}
					disabled={loading || remotes.length === 0}
					className="btn btn-secondary flex items-center justify-center p-2"
					title="Pull"
				>
					{loadingOp === "pull" ? (
						<Loader2 size={14} className="animate-spin" />
					) : (
						<Download size={14} />
					)}
				</button>
				<button
					type="button"
					onClick={handlePush}
					disabled={loading || remotes.length === 0}
					className="btn btn-primary flex items-center justify-center p-2"
					title="Push"
				>
					{loadingOp === "push" ? (
						<Loader2 size={14} className="animate-spin" />
					) : (
						<Upload size={14} />
					)}
				</button>
			</div>
			{remotes.length > 0 ? (
				<div className="space-y-2">
					{remotes.map((r) => (
						<div
							key={r.name}
							className="rounded-lg border border-(--border-secondary) bg-(--bg-secondary) px-3 py-3 transition-colors hover:bg-(--bg-hover)"
						>
							<div className="flex gap-2">
								<Cloud size={14} className="mt-0.5 shrink-0 text-(--text-muted)" />
								<div className="min-w-0 flex-1">
									<p className="truncate font-mono text-xs font-semibold text-(--text-primary)">
										{r.name}
									</p>
									<p className="mt-0.5 truncate font-mono text-[10px] text-(--text-muted)">
										{r.url}
									</p>
								</div>
							</div>
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
