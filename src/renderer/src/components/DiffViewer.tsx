import { useState, useEffect } from "react";
import { Square, CheckSquare, ExternalLink } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitFileStatus, DiffStyle } from "../../../shared/types";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";
import { useTheme } from "../theme/provider";

interface DiffViewerProps {
	projectId: string;
	repoPath: string;
	selectedFile: GitFileStatus | null;
	diffStyle: DiffStyle;
	onRefresh?: () => void;
}

export default function DiffViewer({
	projectId,
	repoPath: _repoPath,
	selectedFile,
	diffStyle,
	onRefresh,
}: DiffViewerProps) {
	const { resolved } = useTheme();
	const [patch, setPatch] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!selectedFile || !projectId) {
			setPatch(null);
			return;
		}
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
				setPatch(diff ?? "");
				setLoading(false);
			})
			.catch(() => {
				setPatch(null);
				setLoading(false);
			});
	}, [projectId, selectedFile]);

	if (!selectedFile) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 text-(--text-muted)">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--bg-secondary)">
					<ExternalLink size={24} className="text-(--border-primary)" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-(--text-secondary)">
						Select a file to view diff
					</p>
					<p className="mt-1 text-xs text-(--text-subtle)">
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

	const isStaged = selectedFile.status === "staged";
	const letter = selectedFile.changeType ?? "M";

	const handleStageToggle = async () => {
		if (!projectId || !onRefresh) return;
		try {
			if (isStaged) {
				await window.gitagen.repo.unstageFiles(projectId, [selectedFile.path]);
			} else {
				await window.gitagen.repo.stageFiles(projectId, [selectedFile.path]);
			}
			onRefresh();
		} catch {
			// ignore
		}
	};

	const handleOpenInEditor = () => {
		window.gitagen.repo.openInEditor(projectId, selectedFile.path);
	};

	const renderToolbar = () => (
		<div className="flex shrink-0 items-center gap-2 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-3">
			<button
				type="button"
				onClick={handleStageToggle}
				className="btn-icon rounded-md p-2"
				title={isStaged ? "Unstage file" : "Stage file"}
			>
				{isStaged ? (
					<CheckSquare size={18} className="text-(--text-primary)" />
				) : (
					<Square size={18} className="text-(--text-muted)" />
				)}
			</button>
			<button
				type="button"
				onClick={handleOpenInEditor}
				className="btn-icon rounded-md p-2"
				title="Open in editor"
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
