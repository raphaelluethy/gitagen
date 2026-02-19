import { useState } from "react";
import { RefreshCw, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { useToast } from "../toast/provider";
import type {
	FetchResultSummary,
	PullResultSummary,
	PushResultSummary,
} from "../../../shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore } from "../stores/repoStore";

type LoadingOp = "fetch" | "pull" | "push" | null;

function formatFetchToast(r: FetchResultSummary): { title: string; desc?: string } {
	const parts: string[] = [];
	if (r.branchesUpdated > 0) {
		parts.push(`${r.branchesUpdated} branch${r.branchesUpdated === 1 ? "" : "es"}`);
	}
	if (r.tagsUpdated > 0) {
		parts.push(`${r.tagsUpdated} tag${r.tagsUpdated === 1 ? "" : "s"}`);
	}
	if (r.refsDeleted > 0) {
		parts.push(`${r.refsDeleted} ref${r.refsDeleted === 1 ? "" : "s"} pruned`);
	}
	if (parts.length === 0) return { title: "Fetch complete", desc: "Already up to date" };
	return {
		title: "Fetched",
		desc: parts.join(", "),
	};
}

function formatPullToast(r: PullResultSummary): { title: string; desc?: string } {
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
	return { title: "Pull complete", desc: "Already up to date" };
}

function formatPushToast(r: PushResultSummary): { title: string; desc?: string } {
	if (r.commitsPushed > 0) {
		const desc = r.branch ? `to ${r.branch}` : undefined;
		return {
			title: `Pushed ${r.commitsPushed} commit${r.commitsPushed === 1 ? "" : "s"}`,
			desc,
		};
	}
	return { title: "Push complete", desc: "Nothing to push" };
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

export default function SyncButtons() {
	const { toast } = useToast();
	const projectId = useProjectStore((s) => s.activeProject?.id ?? "");
	const currentBranchInfo = useRepoStore((s) => s.currentBranchInfo);
	const remotes = useRepoStore((s) => s.remotes);
	const ahead = currentBranchInfo?.ahead ?? 0;
	const behind = currentBranchInfo?.behind ?? 0;
	const hasRemotes = remotes.length > 0;
	const [loadingOp, setLoadingOp] = useState<LoadingOp>(null);
	const loading = loadingOp !== null;
	const disabled = loading || !hasRemotes;

	const runFetch = async () => {
		if (loading) return;
		setLoadingOp("fetch");
		try {
			const result = await window.gitagen.repo.fetch(projectId, {
				prune: true,
			});
			void useRepoStore.getState().refreshStatus();
			const { title, desc } = formatFetchToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Sync failed", getErrorMessage(error));
		} finally {
			setLoadingOp(null);
		}
	};

	const runPull = async () => {
		if (loading) return;
		setLoadingOp("pull");
		try {
			const result = await window.gitagen.repo.pull(projectId, { behind });
			void useRepoStore.getState().refreshStatus();
			const { title, desc } = formatPullToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Sync failed", getErrorMessage(error));
		} finally {
			setLoadingOp(null);
		}
	};

	const runPush = async () => {
		if (loading) return;
		setLoadingOp("push");
		try {
			const result = await window.gitagen.repo.push(projectId, { ahead });
			void useRepoStore.getState().refreshStatus();
			const { title, desc } = formatPushToast(result);
			toast.success(title, desc);
		} catch (error) {
			toast.error("Sync failed", getErrorMessage(error));
		} finally {
			setLoadingOp(null);
		}
	};

	return (
		<div className="flex shrink-0 items-center gap-0.5">
			<button
				type="button"
				onClick={runFetch}
				disabled={disabled}
				className="btn-icon relative rounded-md p-1.5"
				title="Fetch from remote"
				aria-label="Fetch from remote"
			>
				<RefreshCw size={15} className={loadingOp === "fetch" ? "animate-spin" : ""} />
			</button>
			<button
				type="button"
				onClick={runPull}
				disabled={disabled}
				className="btn-icon relative rounded-md p-1.5"
				title={behind > 0 ? `Pull (${behind} behind)` : "Pull from remote"}
				aria-label={behind > 0 ? `Pull ${behind} commits from remote` : "Pull from remote"}
			>
				{loadingOp === "pull" ? (
					<Loader2 size={15} className="animate-spin" />
				) : (
					<ArrowDown size={15} />
				)}
				{behind > 0 && (
					<span
						className="absolute -right-1 -top-0.5 min-w-[12px] rounded-full bg-(--warning-bg) px-1 py-0.5 text-center font-mono text-[9px] font-bold leading-none text-(--warning)"
						aria-label={`${behind} commits behind`}
					>
						{behind > 99 ? "99+" : behind}
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={runPush}
				disabled={disabled}
				className="btn-icon relative rounded-md p-1.5"
				title={ahead > 0 ? `Push (${ahead} ahead)` : "Push to remote"}
				aria-label={ahead > 0 ? `Push ${ahead} commits to remote` : "Push to remote"}
			>
				{loadingOp === "push" ? (
					<Loader2 size={15} className="animate-spin" />
				) : (
					<ArrowUp size={15} />
				)}
				{ahead > 0 && (
					<span
						className="absolute -right-1 -top-0.5 min-w-[12px] rounded-full bg-(--success-bg) px-1 py-0.5 text-center font-mono text-[9px] font-bold leading-none text-(--success)"
						aria-label={`${ahead} commits ahead`}
					>
						{ahead > 99 ? "99+" : ahead}
					</span>
				)}
			</button>
		</div>
	);
}
