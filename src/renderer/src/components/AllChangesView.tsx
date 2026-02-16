import { useState, useEffect, useMemo } from "react";
import { ChevronRight, Square, CheckSquare, ExternalLink, FileCode } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitStatus, GitFileStatus, DiffStyle } from "../../../shared/types";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";
import { useTheme } from "../theme/provider";

interface AllChangesViewProps {
	projectId: string;
	gitStatus: GitStatus;
	diffStyle: DiffStyle;
	onRefresh: () => void;
}

function fileKey(file: GitFileStatus): string {
	return `${file.status}:${file.path}`;
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
	const { resolved } = useTheme();
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
		<div className="border-b border-[var(--border-secondary)] last:border-b-0">
			<div className="flex items-center gap-2 bg-[var(--bg-panel)] px-4 py-3">
				<button
					type="button"
					onClick={onToggleExpand}
					className="btn-icon rounded-md p-1.5 transition-transform"
					title={isExpanded ? "Collapse" : "Expand"}
				>
					<ChevronRight
						size={16}
						className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
					/>
				</button>
				<button
					type="button"
					onClick={handleStageToggle}
					className="btn-icon rounded-md p-1.5"
					title={isStaged ? "Unstage file" : "Stage file"}
				>
					{isStaged ? (
						<CheckSquare size={18} className="text-[var(--text-primary)]" />
					) : (
						<Square size={18} className="text-[var(--text-muted)]" />
					)}
				</button>
				<button
					type="button"
					onClick={handleOpenInEditor}
					className="btn-icon rounded-md p-1.5"
					title="Open in editor"
				>
					<ExternalLink size={15} />
				</button>
				<div className="mx-2 h-4 w-px bg-[var(--border-secondary)]" />
				<span
					className={`badge ${changeTypeColorClass(letter)}`}
					title={changeTypeLabel(letter)}
				>
					{letter}
				</span>
				<span className="font-mono truncate text-sm text-[var(--text-primary)]">
					{file.path}
				</span>
				{isStaged && (
					<span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
						Staged
					</span>
				)}
			</div>
			{isExpanded && (
				<div className="border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] [&_pre]:!bg-transparent [&_pre]:!font-mono [&_pre]:!text-[13px]">
					{loading ? (
						<div className="flex items-center gap-3 p-6">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-primary)] border-t-[var(--text-muted)]" />
							<span className="text-sm text-[var(--text-muted)]">
								Loading diff...
							</span>
						</div>
					) : patch && patch !== "" ? (
						<PatchDiff
							patch={patch}
							options={{
								theme: resolved === "dark" ? "github-dark" : "github-light",
								diffStyle,
								disableLineNumbers: false,
							}}
							className="min-h-0"
						/>
					) : (
						<div className="flex flex-col items-center gap-3 p-8 text-center">
							<FileCode size={24} className="text-[var(--border-primary)]" />
							<div>
								<p className="text-sm text-[var(--text-muted)]">
									No changes or binary file
								</p>
								<p className="mt-1 text-xs text-[var(--text-subtle)]">
									This file has no text diff to display
								</p>
							</div>
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
	const allFiles: GitFileStatus[] = useMemo(
		() => [...gitStatus.staged, ...gitStatus.unstaged, ...gitStatus.untracked],
		[gitStatus]
	);

	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
		const keys = new Set<string>();
		for (const f of allFiles) keys.add(fileKey(f));
		return keys;
	});

	useEffect(() => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			for (const f of allFiles) {
				const k = fileKey(f);
				if (!next.has(k)) next.add(k);
			}
			return next;
		});
	}, [allFiles]);

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
			<div className="flex flex-1 flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
					<FileCode size={24} className="text-[var(--border-primary)]" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-[var(--text-secondary)]">No changes</p>
					<p className="mt-1 text-xs text-[var(--text-subtle)]">
						All files are committed
					</p>
				</div>
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
