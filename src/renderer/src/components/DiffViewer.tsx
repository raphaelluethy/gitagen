import { useState, useEffect, useRef, useCallback } from "react";
import { CircleMinus, CirclePlus, ExternalLink } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";
import { useThemeStore } from "../stores/themeStore";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore } from "../stores/repoStore";
import { useUIStore } from "../stores/uiStore";
import { useToast } from "../toast/provider";

export default function DiffViewer() {
	const projectId = useProjectStore((s) => s.activeProject?.id ?? "");
	const selectedFile = useRepoStore((s) => s.selectedFile);
	const refreshKey = useRepoStore((s) => s.refreshKey);
	const diffStyle = useUIStore((s) => s.diffStyle);
	const resolved = useThemeStore((s) => s.resolved);
	const { toast } = useToast();
	const [patch, setPatch] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const requestIdRef = useRef(0);

	const filePath = selectedFile?.path ?? null;
	const isStaged = selectedFile?.status === "staged";
	const letter = selectedFile?.changeType ?? "M";

	const handleStageToggle = useCallback(async () => {
		if (!projectId || !selectedFile) return;
		try {
			if (isStaged) {
				await window.gitagen.repo.unstageFiles(projectId, [selectedFile.path]);
			} else {
				await window.gitagen.repo.stageFiles(projectId, [selectedFile.path]);
			}
			void useRepoStore.getState().refreshStatus();
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Staging failed", msg);
		}
	}, [projectId, selectedFile, isStaged, toast]);

	useEffect(() => {
		if (!filePath || !projectId || !selectedFile) {
			setPatch(null);
			return;
		}
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setLoading(true);
		const scope =
			selectedFile.status === "staged"
				? "staged"
				: selectedFile.status === "unstaged"
					? "unstaged"
					: "untracked";
		window.gitagen.repo
			.getPatch(projectId, selectedFile.path, scope)
			.then((diff) => {
				if (requestIdRef.current !== requestId) return;
				setPatch(diff ?? "");
				setLoading(false);
			})
			.catch(() => {
				if (requestIdRef.current !== requestId) return;
				setPatch(null);
				setLoading(false);
			});
	}, [projectId, filePath, selectedFile, refreshKey]);

	if (!selectedFile) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-(--border-secondary) bg-(--bg-secondary)">
					<ExternalLink size={22} strokeWidth={1.5} className="text-(--text-subtle)" />
				</div>
				<div className="text-center">
					<p className="text-[13px] font-medium text-(--text-secondary)">
						Select a file to view diff
					</p>
					<p className="mt-1.5 text-xs leading-relaxed text-(--text-subtle)">
						Choose a file from the sidebar to see changes
					</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading diff...</p>
			</div>
		);
	}

	const handleOpenInEditor = () => {
		window.gitagen.repo.openInEditor(projectId, selectedFile.path);
	};

	const renderToolbar = () => (
		<div className="flex shrink-0 items-center gap-2 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-3">
			<button
				type="button"
				onClick={handleStageToggle}
				className={
					isStaged
						? "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-(--bg-tertiary) text-(--text-primary) transition-colors hover:bg-(--bg-hover)"
						: "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--success-bg) hover:text-(--success)"
				}
				title={isStaged ? "Unstage file" : "Stage file"}
				aria-label={isStaged ? "Unstage file" : "Stage file"}
			>
				{isStaged ? (
					<>
						<CircleMinus size={15} />
						<span>Unstage</span>
					</>
				) : (
					<>
						<CirclePlus size={15} />
						<span>Stage</span>
					</>
				)}
			</button>
			<button
				type="button"
				onClick={handleOpenInEditor}
				className="btn-icon rounded-md p-2"
				title="Open in editor"
				aria-label="Open in editor"
			>
				<ExternalLink size={16} />
			</button>
			<div className="mx-2 h-4 w-px bg-(--border-secondary)" />
			<span
				className={`badge ${changeTypeColorClass(letter)}`}
				title={changeTypeLabel(letter)}
			>
				{letter}
			</span>
			<span className="font-mono truncate text-sm text-(--text-primary)">
				{selectedFile.path}
			</span>
			{isStaged && (
				<span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
					Staged
				</span>
			)}
		</div>
	);

	if (patch === null || patch === "") {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{renderToolbar()}
				<div className="flex flex-1 items-center justify-center">
					<div className="text-center">
						<p className="text-sm text-(--text-muted)">No changes or binary file</p>
						<p className="mt-1 text-xs text-(--text-subtle)">
							This file has no text diff to display
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{renderToolbar()}
			<div className="min-h-0 flex-1 overflow-auto bg-(--bg-primary)">
				<div className="min-h-full [&_pre]:bg-transparent! [&_pre]:font-mono! [&_pre]:text-[13px]!">
					<PatchDiff
						patch={patch}
						options={{
							theme: resolved === "dark" ? "github-dark" : "github-light",
							diffStyle,
							disableLineNumbers: false,
						}}
						className="min-h-full"
					/>
				</div>
			</div>
		</div>
	);
}
