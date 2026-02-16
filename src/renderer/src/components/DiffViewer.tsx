import { useState, useEffect } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitFileStatus, DiffStyle } from "../../../shared/types";

interface DiffViewerProps {
	projectId: string;
	repoPath: string;
	selectedFile: GitFileStatus | null;
	diffStyle: DiffStyle;
}

export default function DiffViewer({
	projectId,
	repoPath,
	selectedFile,
	diffStyle,
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

	if (patch === null || patch === "") {
		return (
			<div className="flex flex-1 flex-col p-4">
				<p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
					{selectedFile.path}
				</p>
				<p className="text-zinc-500 dark:text-zinc-500">No changes or binary file</p>
			</div>
		);
	}

	return (
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
	);
}
