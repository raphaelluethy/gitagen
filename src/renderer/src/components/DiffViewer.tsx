import { useState, useEffect } from "react";
import { Square, CheckSquare, ExternalLink } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitFileStatus, DiffStyle } from "../../../shared/types";
import { changeTypeColorClass } from "../utils/status-badge";

interface DiffViewerProps {
	projectId: string;
	repoPath: string;
	selectedFile: GitFileStatus | null;
	diffStyle: DiffStyle;
	onRefresh?: () => void;
}

export default function DiffViewer({
	projectId,
	repoPath,
	selectedFile,
	diffStyle,
	onRefresh,
}: DiffViewerProps) {
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
			<div className="flex flex-1 items-center justify-center text-zinc-500 dark:text-zinc-500">
				<p>Select a file to view diff</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center text-zinc-500 dark:text-zinc-500">
				Loading diff...
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

	if (patch === null || patch === "") {
		return (
			<div className="flex flex-1 flex-col">
				<div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
					<button
						type="button"
						onClick={handleStageToggle}
						className="flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
						title={isStaged ? "Unstage" : "Stage"}
					>
						{isStaged ? (
							<CheckSquare size={16} className="text-emerald-600" />
						) : (
							<Square size={16} />
						)}
					</button>
					<button
						type="button"
						onClick={handleOpenInEditor}
						className="flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
						title="Open in editor"
					>
						<ExternalLink size={14} />
					</button>
					<span
						className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-bold ${changeTypeColorClass(letter)}`}
					>
						{letter}
					</span>
					<span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
						{selectedFile.path}
					</span>
				</div>
				<div className="flex-1 p-4">
					<p className="text-zinc-500 dark:text-zinc-500">No changes or binary file</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
				<button
					type="button"
					onClick={handleStageToggle}
					className="flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
					title={isStaged ? "Unstage" : "Stage"}
				>
					{isStaged ? (
						<CheckSquare size={16} className="text-emerald-600" />
					) : (
						<Square size={16} />
					)}
				</button>
				<button
					type="button"
					onClick={handleOpenInEditor}
					className="flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
					title="Open in editor"
				>
					<ExternalLink size={14} />
				</button>
				<span
					className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-bold ${changeTypeColorClass(letter)}`}
				>
					{letter}
				</span>
				<span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
					{selectedFile.path}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				<div className="min-h-full bg-zinc-50 dark:bg-zinc-950 [&_pre]:!bg-transparent">
					<PatchDiff
						patch={patch}
						options={{
							theme: "github-dark",
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
