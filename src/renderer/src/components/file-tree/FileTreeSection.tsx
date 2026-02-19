import { useState, useMemo, useEffect, useCallback } from "react";
import { Folder, FolderOpen, List, ListMinus, ListPlus } from "lucide-react";
import type { GitFileStatus } from "../../../../shared/types";
import type { FileTreeNode } from "./types";
import { buildFileTree } from "./utils";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToast } from "../../toast/provider";
import { TreeItem } from "./TreeItem";

export interface FileTreeSectionProps {
	projectId: string;
	section: "staged" | "unstaged" | "untracked";
	title: string;
	count: number;
	files: GitFileStatus[];
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	onRefresh: () => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
	onExpandAll: (paths: Set<string>) => void;
	onFoldAll: () => void;
	onViewAll?: (section: "staged" | "unstaged" | "untracked") => void;
}

function getAutoExpandPaths(nodes: FileTreeNode[]): string[] {
	const folders = nodes.filter((n) => n.type === "folder");
	if (folders.length === 1) {
		return [folders[0].path, ...getAutoExpandPaths(folders[0].children ?? [])];
	}
	return [];
}

function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | null {
	for (const node of nodes) {
		if (node.path === path) return node;
		if (node.children) {
			const found = findNode(node.children, path);
			if (found) return found;
		}
	}
	return null;
}

function collectPaths(nodes: FileTreeNode[], paths: Set<string>): void {
	for (const n of nodes) {
		if (n.type === "folder") paths.add(n.path);
		if (n.children) collectPaths(n.children, paths);
	}
}

export function FileTreeSection({
	projectId,
	section,
	title,
	count,
	files,
	selectedFile,
	onSelect,
	onRefresh,
	expandedFolders,
	onToggleFolder,
	onExpandAll,
	onFoldAll,
	onViewAll,
}: FileTreeSectionProps) {
	const autoExpandSingleFolder = useSettingsStore((s) => s.autoExpandSingleFolder);
	const { toast } = useToast();
	const tree = useMemo(() => buildFileTree(files), [files]);

	const [autoExpanded, setAutoExpanded] = useState(false);

	useEffect(() => {
		setAutoExpanded(false);
	}, [projectId]);

	useEffect(() => {
		if (autoExpandSingleFolder && tree.length > 0 && !autoExpanded) {
			const paths = getAutoExpandPaths(tree);
			if (paths.length > 0) {
				onExpandAll(new Set(paths));
				setAutoExpanded(true);
			}
		}
	}, [autoExpandSingleFolder, tree, onExpandAll, autoExpanded]);

	const onToggleFolderWithAutoExpand = useCallback(
		(path: string) => {
			if (!expandedFolders.has(path)) {
				const node = findNode(tree, path);
				if (node && node.children) {
					const paths = getAutoExpandPaths(node.children);
					if (paths.length > 0) {
						onExpandAll(new Set([path, ...paths]));
						return;
					}
				}
			}
			onToggleFolder(path);
		},
		[expandedFolders, tree, onExpandAll, onToggleFolder]
	);

	if (tree.length === 0) return null;

	const expandAll = () => {
		const paths = new Set<string>();
		collectPaths(tree, paths);
		onExpandAll(paths);
	};

	const sectionKey = title.toLowerCase().replace(/\s/g, "-");
	const viewAllSection: "staged" | "unstaged" | "untracked" =
		sectionKey === "staged" ? "staged" : sectionKey === "unstaged" ? "unstaged" : "untracked";

	const handleStageAll = async () => {
		try {
			if (section === "staged") {
				await window.gitagen.repo.unstageAll(projectId);
			} else {
				await window.gitagen.repo.stageFiles(
					projectId,
					files.map((f) => f.path)
				);
			}
			onRefresh();
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Staging failed", msg);
		}
	};

	return (
		<div className="mb-4 overflow-visible">
			<div className="mb-2 px-3 py-2 overflow-visible">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<div className="flex items-center gap-1.5 shrink-0">
						<h3 className="section-title">{title}</h3>
						<span className="font-mono text-[10px] text-(--text-muted)">{count}</span>
					</div>
					{count > 0 && (
						<div className="flex items-center gap-1 shrink-0">
							{onViewAll && (
								<button
									type="button"
									onClick={() => onViewAll(viewAllSection)}
									data-tooltip="View all"
									data-tooltip-position="bottom"
									className="flex items-center justify-center rounded-md p-1.5 text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
								>
									<List size={16} strokeWidth={2} />
								</button>
							)}
							<button
								type="button"
								onClick={handleStageAll}
								data-tooltip={section === "staged" ? "Unstage all" : "Stage all"}
								data-tooltip-position="bottom"
								className="flex items-center justify-center rounded-md p-1.5 text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
							>
								{section === "staged" ? (
									<ListMinus size={16} strokeWidth={2} />
								) : (
									<ListPlus size={16} strokeWidth={2} />
								)}
							</button>
							<button
								type="button"
								onClick={expandAll}
								data-tooltip="Expand all folders"
								data-tooltip-position="bottom"
								className="flex items-center justify-center rounded-md p-1.5 text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
							>
								<FolderOpen size={16} strokeWidth={2} />
							</button>
							<button
								type="button"
								onClick={onFoldAll}
								data-tooltip="Fold all folders"
								data-tooltip-position="bottom"
								className="flex items-center justify-center rounded-md p-1.5 text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
							>
								<Folder size={16} strokeWidth={2} />
							</button>
						</div>
					)}
				</div>
			</div>
			<div className="px-1">
				{tree.map((node) => (
					<TreeItem
						key={node.path}
						node={node}
						depth={0}
						section={section}
						projectId={projectId}
						onRefresh={onRefresh}
						selectedFile={selectedFile}
						onSelect={onSelect}
						expandedFolders={expandedFolders}
						onToggleFolder={onToggleFolderWithAutoExpand}
					/>
				))}
			</div>
		</div>
	);
}
