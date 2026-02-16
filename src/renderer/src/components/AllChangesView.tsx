import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
	ChevronRight,
	UnfoldVertical,
	FoldVertical,
	CircleMinus,
	CirclePlus,
	ExternalLink,
	FileCode,
} from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitStatus, GitFileStatus, DiffStyle } from "../../../shared/types";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";
import { useTheme } from "../theme/provider";
import { useToast } from "../toast/provider";

interface AllChangesViewProps {
	projectId: string;
	gitStatus: GitStatus;
	diffStyle: DiffStyle;
	selectedFile: GitFileStatus | null;
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
	isSelected,
	onToggleExpand,
	cardRef,
	cachedPatch,
	onPatchLoaded,
}: {
	projectId: string;
	file: GitFileStatus;
	diffStyle: DiffStyle;
	onRefresh: () => void;
	isExpanded: boolean;
	isSelected: boolean;
	onToggleExpand: () => void;
	cardRef?: React.Ref<HTMLDivElement>;
	cachedPatch?: string | null;
	onPatchLoaded?: (path: string, patch: string) => void;
}) {
	const { resolved } = useTheme();
	const { toast } = useToast();
	const [patch, setPatch] = useState<string | null>(cachedPatch ?? null);
	const [loading, setLoading] = useState(false);
	const isStaged = file.status === "staged";
	const letter = file.changeType ?? "M";
	const scope =
		file.status === "staged" ? "staged" : file.status === "unstaged" ? "unstaged" : "untracked";

	useEffect(() => {
		if (!projectId || !file) return;
		if (!isExpanded) {
			setPatch(null);
			return;
		}
		if (cachedPatch != null) {
			setPatch(cachedPatch);
			return;
		}
		setLoading(true);
		window.gitagen.repo
			.getPatch(projectId, file.path, scope)
			.then((diff) => {
				const p = diff ?? "";
				setPatch(p);
				setLoading(false);
				onPatchLoaded?.(file.path, p);
			})
			.catch(() => {
				setPatch(null);
				setLoading(false);
			});
	}, [projectId, file.path, scope, isExpanded, cachedPatch]);

	const handleStageToggle = async () => {
		if (!projectId) return;
		try {
			if (patch != null) {
				onPatchLoaded?.(file.path, patch);
			}
			if (isStaged) {
				await window.gitagen.repo.unstageFiles(projectId, [file.path]);
			} else {
				await window.gitagen.repo.stageFiles(projectId, [file.path]);
			}
			onRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Staging failed", msg);
		}
	};

	const handleOpenInEditor = () => {
		window.gitagen.repo.openInEditor(projectId, file.path);
	};

	return (
		<div
			ref={cardRef}
			className={`border-b border-(--border-secondary) last:border-b-0 transition-colors duration-300 ${isSelected ? "ring-2 ring-inset ring-(--accent-primary)" : ""}`}
		>
			<div className="flex items-center gap-2 bg-(--bg-panel) px-4 py-3">
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
					className={
						isStaged
							? "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-(--bg-tertiary) text-(--text-primary) transition-colors hover:bg-(--bg-hover)"
							: "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--success-bg) hover:text-(--success)"
					}
					title={isStaged ? "Unstage file" : "Stage file"}
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
					className="btn-icon rounded-md p-1.5"
					title="Open in editor"
				>
					<ExternalLink size={15} />
				</button>
				<div className="mx-2 h-4 w-px bg-(--border-secondary)" />
				<span
					className={`badge ${changeTypeColorClass(letter)}`}
					title={changeTypeLabel(letter)}
				>
					{letter}
				</span>
				<span className="font-mono truncate text-sm text-(--text-primary)">
					{file.path}
				</span>
				{isStaged && (
					<span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
						Staged
					</span>
				)}
			</div>
			{isExpanded && (
				<div className="border-t border-(--border-secondary) bg-(--bg-primary) [&_pre]:bg-transparent! [&_pre]:font-mono! [&_pre]:text-[13px]!">
					{loading ? (
						<div className="flex items-center gap-3 p-6">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
							<span className="text-sm text-(--text-muted)">Loading diff...</span>
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
							<FileCode size={24} className="text-(--border-primary)" />
							<div>
								<p className="text-sm text-(--text-muted)">
									No changes or binary file
								</p>
								<p className="mt-1 text-xs text-(--text-subtle)">
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
	selectedFile,
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

	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const patchCacheRef = useRef<Map<string, string>>(new Map());

	const handlePatchLoaded = useCallback((path: string, patch: string) => {
		patchCacheRef.current.set(path, patch);
	}, []);

	useEffect(() => {
		const currentPaths = new Set(allFiles.map((f) => f.path));
		for (const key of patchCacheRef.current.keys()) {
			if (!currentPaths.has(key)) patchCacheRef.current.delete(key);
		}
	}, [allFiles]);

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

	useEffect(() => {
		if (!selectedFile) return;
		const key = fileKey(selectedFile);
		const el = cardRefs.current.get(key);
		if (el) {
			requestAnimationFrame(() => {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			});
		}
	}, [selectedFile]);

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
			<div className="flex flex-1 flex-col items-center justify-center gap-4 text-(--text-muted)">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--bg-secondary)">
					<FileCode size={24} className="text-(--border-primary)" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-(--text-secondary)">No changes</p>
					<p className="mt-1 text-xs text-(--text-subtle)">All files are committed</p>
				</div>
			</div>
		);
	}

	const selectedKey = selectedFile ? fileKey(selectedFile) : null;

	type SectionKey = "staged" | "unstaged" | "untracked";
	const sections: { key: SectionKey; title: string; files: GitFileStatus[] }[] = [
		{ key: "staged", title: "Staged", files: gitStatus.staged },
		{ key: "unstaged", title: "Unstaged", files: gitStatus.unstaged },
		{ key: "untracked", title: "Untracked", files: gitStatus.untracked },
	];

	const expandAllForSection = (sectionFiles: GitFileStatus[]) => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			for (const f of sectionFiles) next.add(fileKey(f));
			return next;
		});
	};

	const foldAllForSection = (sectionFiles: GitFileStatus[]) => {
		setExpandedKeys((prev) => {
			const next = new Set(prev);
			for (const f of sectionFiles) next.delete(fileKey(f));
			return next;
		});
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-auto">
				{sections.map(({ key, title, files }) => {
					if (files.length === 0) return null;
					return (
						<div
							key={key}
							className="border-b border-(--border-secondary) last:border-b-0"
						>
							<div className="flex shrink-0 items-center gap-2 bg-(--bg-secondary) px-4 py-2">
								<h3 className="text-sm font-semibold text-(--text-primary)">
									{title}
								</h3>
								<span className="font-mono text-[10px] text-(--text-muted)">
									{files.length}
								</span>
								<div className="ml-2 flex items-center gap-1">
									<button
										type="button"
										onClick={() => expandAllForSection(files)}
										className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
										title={`Expand all ${title.toLowerCase()}`}
									>
										<UnfoldVertical size={12} strokeWidth={2} />
										<span>Expand</span>
									</button>
									<button
										type="button"
										onClick={() => foldAllForSection(files)}
										className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
										title={`Fold all ${title.toLowerCase()}`}
									>
										<FoldVertical size={12} strokeWidth={2} />
										<span>Fold</span>
									</button>
								</div>
							</div>
							{files.map((file) => {
								const key_ = fileKey(file);
								return (
									<FileChangeCard
										key={key_}
										projectId={projectId}
										file={file}
										diffStyle={diffStyle}
										onRefresh={onRefresh}
										isExpanded={expandedKeys.has(key_)}
										isSelected={key_ === selectedKey}
										onToggleExpand={() => toggleExpand(file)}
										cardRef={(el: HTMLDivElement | null) => {
											if (el) cardRefs.current.set(key_, el);
											else cardRefs.current.delete(key_);
										}}
										cachedPatch={patchCacheRef.current.get(file.path) ?? null}
										onPatchLoaded={handlePatchLoaded}
									/>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
