import { useState, useEffect } from "react";
import {
	ChevronDown,
	ChevronRight,
	Square,
	CheckSquare,
	ExternalLink,
} from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitStatus, GitFileStatus, DiffStyle } from "../../../shared/types";
import { changeTypeColorClass } from "../utils/status-badge";

interface AllChangesViewProps {
	projectId: string;
	gitStatus: GitStatus;
	diffStyle: DiffStyle;
	onRefresh: () => void;
}

function fileKey(file: GitFileStatus): string {
	return `${file.status}:${file.path}`;
}

function allFilePaths(files: GitFileStatus[]): string {
	return files.map((f) => f.path).sort().join("\0");
}

function FileChangeCard({
	projectId,
	file,
	diffStyle,
	onRefresh,
	isExpanded,
	onToggleExpand,
}: {
	projectId: string;
	file: GitFileStatus;
	diffStyle: DiffStyle;
	onRefresh: () => void;
	isExpanded: boolean;
	onToggleExpand: () => void;
}) {
	const [patch, setPatch] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const isStaged = file.status === "staged";
	const letter = file.changeType ?? "M";
	const scope =
		file.status === "staged" ? "staged" : file.status === "unstaged" ? "unstaged" : "untracked";

	useEffect(() => {
		if (!projectId || !file) return;
		setPatch(null);
		if (!isExpanded) return;
		setLoading(true);
		window.gitagen.repo
			.getPatch(projectId, file.path, scope)
			.then((diff) => {
				setPatch(diff ?? "");
				setLoading(false);
			})
			.catch(() => {
				setPatch(null);
				setLoading(false);
			});
	}, [projectId, file.path, scope, isExpanded]);

	const handleStageToggle = async () => {
		if (!projectId) return;
		try {
			if (isStaged) {
				await window.gitagen.repo.unstageFiles(projectId, [file.path]);
			} else {
				await window.gitagen.repo.stageFiles(projectId, [file.path]);
			}
			onRefresh();
		} catch {
			// ignore
		}
	};

	const handleOpenInEditor = () => {
		window.gitagen.repo.openInEditor(projectId, file.path);
	};

	return (
		<div className="border-b border-zinc-200 dark:border-zinc-800">
			<div className="flex items-center gap-2 bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
				<button
					type="button"
					onClick={onToggleExpand}
					className="flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
					title={isExpanded ? "Collapse" : "Expand"}
				>
					{isExpanded ? (
						<ChevronDown size={16} />
					) : (
						<ChevronRight size={16} />
					)}
				</button>
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
					{file.path}
				</span>
			</div>
			{isExpanded && (
				<div className="bg-zinc-50 dark:bg-zinc-950 [&_pre]:!bg-transparent">
					{loading ? (
						<div className="p-4 text-sm text-zinc-500">Loading diff...</div>
					) : patch && patch !== "" ? (
						<PatchDiff
							patch={patch}
							options={{
								theme: "github-dark",
								diffStyle,
								disableLineNumbers: false,
							}}
							className="min-h-0"
						/>
					) : (
						<div className="p-4 text-sm text-zinc-500">
							No changes or binary file
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default function AllChangesView({
	projectId,
	gitStatus,
	diffStyle,
	onRefresh,
}: AllChangesViewProps) {
	const allFiles: GitFileStatus[] = [
		...gitStatus.staged,
		...gitStatus.unstaged,
		...gitStatus.untracked,
	];

	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
		const keys = new Set<string>();
		for (const f of allFiles) keys.add(fileKey(f));
		return keys;
	});

	// When new files appear, expand them by default
	const filePathsKey = allFilePaths(allFiles);
	useEffect(() => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			for (const f of allFiles) {
				const k = fileKey(f);
				if (!next.has(k)) next.add(k);
			}
			return next;
		});
	}, [filePathsKey]);

	const toggleExpand = (file: GitFileStatus) => {
		const k = fileKey(file);
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(k)) next.delete(k);
			else next.add(k);
			return next;
		});
	};

	if (allFiles.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-zinc-500 dark:text-zinc-500">
				<p>No changes</p>
			</div>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			{allFiles.map((file) => (
				<FileChangeCard
					key={fileKey(file)}
					projectId={projectId}
					file={file}
					diffStyle={diffStyle}
					onRefresh={onRefresh}
					isExpanded={expandedKeys.has(fileKey(file))}
					onToggleExpand={() => toggleExpand(file)}
				/>
			))}
		</div>
	);
}
