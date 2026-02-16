import { useState, useMemo, useEffect, useCallback } from "react";
import {
	ChevronRight,
	ChevronDown,
	ChevronLeft,
	File,
	Folder,
	FolderOpen,
	GitBranch,
	List,
	ListMinus,
	ListPlus,
	Minus,
	Plus,
} from "lucide-react";
import type { GitStatus, GitFileStatus } from "../../../shared/types";
import type { Project } from "../../../shared/types";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";
import { useSettings } from "../settings/provider";
import { useToast } from "../toast/provider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface SidebarProps {
	projectId: string;
	status: GitStatus;
	selectedFile: GitFileStatus | null;
	onSelectFile: (file: GitFileStatus) => void;
	onRefresh: () => void;
	onBack?: () => void;
	projects?: Project[];
	activeProject?: Project | null;
	onProjectChange?: (project: Project) => void;
	onAddProject?: () => void;
	onViewAll?: (section: "staged" | "unstaged" | "untracked") => void;
}

export interface FileTreeNode {
	name: string;
	type: "file" | "folder";
	path: string;
	file?: GitFileStatus;
	children?: FileTreeNode[];
}

function buildFileTree(files: GitFileStatus[]): FileTreeNode[] {
	interface MutableNode {
		name: string;
		type: "file" | "folder";
		path: string;
		file?: GitFileStatus;
		children?: Map<string, MutableNode>;
	}

	const root: Map<string, MutableNode> = new Map();

	for (const file of files) {
		const parts = file.path.split("/");
		let currentLevel = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (isLast) {
				currentLevel.set(part, { name: part, type: "file", path: file.path, file });
			} else {
				if (!currentLevel.has(part)) {
					currentLevel.set(part, {
						name: part,
						type: "folder",
						path: pathSoFar,
						children: new Map(),
					});
				}
				const node = currentLevel.get(part)!;
				currentLevel = node.children!;
			}
		}
	}

	function toFileTreeNode(map: Map<string, MutableNode>): FileTreeNode[] {
		return Array.from(map.entries())
			.map(([, node]) => {
				const result: FileTreeNode = {
					name: node.name,
					type: node.type,
					path: node.path,
					...(node.file && { file: node.file }),
				};
				if (node.type === "folder" && node.children) {
					result.children = toFileTreeNode(node.children);
				}
				return result;
			})
			.sort((a, b) => {
				const aIsFolder = a.type === "folder";
				const bIsFolder = b.type === "folder";
				if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
				return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
			});
	}

	return toFileTreeNode(root);
}

function collectFilePaths(node: FileTreeNode): string[] {
	if (node.type === "file" && node.file) return [node.file.path];
	if (!node.children) return [];
	return node.children.flatMap(collectFilePaths);
}

function statusBarColor(changeType: string): string {
	switch (changeType) {
		case "A":
			return "var(--change-added)";
		case "D":
			return "var(--change-deleted)";
		default:
			return "var(--change-modified)";
	}
}

function TreeItem({
	node,
	depth,
	section,
	projectId,
	onRefresh,
	selectedFile,
	onSelect,
	expandedFolders,
	onToggleFolder,
}: {
	node: FileTreeNode;
	depth: number;
	section: "staged" | "unstaged" | "untracked";
	projectId: string;
	onRefresh: () => void;
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
}) {
	const { toast } = useToast();
	const paddingLeft = depth * 16 + 12;

	const isFile = node.type === "file" && node.file;
	const isFolder = node.type === "folder" && node.children;
	const isSelected =
		isFile && selectedFile?.path === node.file!.path && selectedFile?.status === node.file!.status;
	const letter = isFile ? (node.file!.changeType ?? "M") : "M";
	const barColor = statusBarColor(letter);
	const canStage = section === "unstaged" || section === "untracked";
	const isExpanded = isFolder && expandedFolders.has(node.path);
	const childNodes = isFolder ? (node.children as FileTreeNode[]) : [];
	const paths = isFolder ? collectFilePaths(node) : [];

	const handleStage = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			if (!isFile) return;
			try {
				if (canStage) {
					await window.gitagen.repo.stageFiles(projectId, [node.file!.path]);
				} else {
					await window.gitagen.repo.unstageFiles(projectId, [node.file!.path]);
				}
				onRefresh();
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				toast.error("Staging failed", msg);
			}
		},
		[projectId, node, isFile, canStage, onRefresh, toast]
	);

	const handleStageFolder = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			if (paths.length === 0) return;
			try {
				if (canStage) {
					await window.gitagen.repo.stageFiles(projectId, paths);
				} else {
					await window.gitagen.repo.unstageFiles(projectId, paths);
				}
				onRefresh();
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				toast.error("Staging failed", msg);
			}
		},
		[projectId, paths, canStage, onRefresh, toast]
	);

	if (isFile) {

		return (
			<div
				className={`group flex w-full items-center py-1.5 text-left text-[13px] outline-none transition-all ${
					isSelected
						? "bg-(--bg-active) text-(--text-primary)"
						: "text-(--text-primary) hover:bg-(--bg-hover)"
				}`}
				style={{
					paddingLeft,
					borderLeft: `2px solid ${isSelected ? "var(--text-muted)" : barColor}`,
				}}
			>
				<button
					type="button"
					onClick={() => onSelect(node.file!)}
					className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
					title={node.path}
				>
					<File
						size={14}
						className={`shrink-0 ${isSelected ? "text-(--text-primary)" : "text-(--text-muted)"}`}
						strokeWidth={2}
					/>
					<span
						className={`badge ${changeTypeColorClass(letter)}`}
						title={changeTypeLabel(letter)}
					>
						{letter}
					</span>
					<span className={`block flex-1 truncate ${isSelected ? "font-medium" : ""}`}>
						{node.name}
					</span>
				</button>
				<button
					type="button"
					onClick={handleStage}
					className={`ml-auto shrink-0 rounded p-0.5 opacity-0 transition-all duration-120 group-hover:opacity-100 hover:bg-(--bg-tertiary) text-(--text-muted) ${
						canStage ? "hover:text-(--success)" : "hover:text-(--text-muted)"
					}`}
					title={canStage ? "Stage file" : "Unstage file"}
					aria-label={canStage ? "Stage file" : "Unstage file"}
				>
					{canStage ? (
						<Plus size={14} strokeWidth={2} />
					) : (
						<Minus size={14} strokeWidth={2} />
					)}
				</button>
			</div>
		);
	}

	if (isFolder) {
		return (
			<div key={node.path}>
				<div
					className="group flex w-full items-center py-1.5 text-left text-[13px] text-(--text-secondary) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					style={{ paddingLeft }}
				>
					<button
						type="button"
						onClick={() => onToggleFolder(node.path)}
						className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
					>
						<ChevronRight
							size={14}
							className={`shrink-0 text-(--text-muted) transition-transform ${isExpanded ? "rotate-90" : ""}`}
							strokeWidth={2}
						/>
						{isExpanded ? (
							<FolderOpen
								size={14}
								className="shrink-0 text-(--text-primary)"
								strokeWidth={2}
							/>
						) : (
							<Folder
								size={14}
								className="shrink-0 text-(--text-muted)"
								strokeWidth={2}
							/>
						)}
						<span className="truncate font-medium">{node.name}</span>
					</button>
					{paths.length > 0 && (
						<button
							type="button"
							onClick={handleStageFolder}
							className={`ml-auto shrink-0 rounded p-0.5 opacity-0 transition-all duration-120 group-hover:opacity-100 hover:bg-(--bg-tertiary) text-(--text-muted) ${
								canStage ? "hover:text-(--success)" : "hover:text-(--text-muted)"
							}`}
							title={canStage ? "Stage folder" : "Unstage folder"}
							aria-label={canStage ? "Stage folder" : "Unstage folder"}
						>
							{canStage ? (
								<Plus size={14} strokeWidth={2} />
							) : (
								<Minus size={14} strokeWidth={2} />
							)}
						</button>
					)}
				</div>
				{isExpanded && (
					<div>
						{childNodes.map((child) => (
							<TreeItem
								key={child.path}
								node={child}
								depth={depth + 1}
								section={section}
								projectId={projectId}
								onRefresh={onRefresh}
								selectedFile={selectedFile}
								onSelect={onSelect}
								expandedFolders={expandedFolders}
								onToggleFolder={onToggleFolder}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	return null;
}

function FileTreeSection({
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
}: {
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
}) {
	const { settings } = useSettings();
	const { toast } = useToast();
	const tree = useMemo(() => buildFileTree(files), [files]);

	function getAutoExpandPaths(nodes: FileTreeNode[]): string[] {
		const folders = nodes.filter((n) => n.type === "folder");
		if (folders.length === 1) {
			return [folders[0].path, ...getAutoExpandPaths(folders[0].children ?? [])];
		}
		return [];
	}

	useEffect(() => {
		if (settings.autoExpandSingleFolder && tree.length > 0) {
			const paths = getAutoExpandPaths(tree);
			if (paths.length > 0) {
				onExpandAll(new Set(paths));
			}
		}
	}, [settings.autoExpandSingleFolder, tree, onExpandAll]);

	if (tree.length === 0) return null;

	const expandAll = () => {
		const paths = new Set<string>();
		function collectPaths(nodes: FileTreeNode[]) {
			for (const n of nodes) {
				if (n.type === "folder") paths.add(n.path);
				if (n.children) collectPaths(n.children);
			}
		}
		collectPaths(tree);
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
						onToggleFolder={onToggleFolder}
					/>
				))}
			</div>
		</div>
	);
}

export default function Sidebar({
	projectId,
	status,
	selectedFile,
	onSelectFile,
	onRefresh,
	onBack,
	projects = [],
	activeProject,
	onProjectChange,
	onAddProject,
	onViewAll,
}: SidebarProps) {
	type SectionKey = "staged" | "unstaged" | "untracked";
	const [expandedFoldersBySection, setExpandedFoldersBySection] = useState<
		Record<SectionKey, Set<string>>
	>(() => ({
		staged: new Set(),
		unstaged: new Set(),
		untracked: new Set(),
	}));
	const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);

	const toggleFolder = useCallback((section: SectionKey, path: string) => {
		setExpandedFoldersBySection((prev) => {
			const next = new Set(prev[section]);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return { ...prev, [section]: next };
		});
	}, []);

	const expandAllFolders = useCallback((section: SectionKey, paths: Set<string>) => {
		setExpandedFoldersBySection((prev) => ({
			...prev,
			[section]: new Set([...prev[section], ...paths]),
		}));
	}, []);

	const foldAllFolders = useCallback((section: SectionKey) => {
		setExpandedFoldersBySection((prev) => ({ ...prev, [section]: new Set() }));
	}, []);

	const onExpandAllStaged = useCallback(
		(paths: Set<string>) => expandAllFolders("staged", paths),
		[expandAllFolders]
	);
	const onExpandAllUnstaged = useCallback(
		(paths: Set<string>) => expandAllFolders("unstaged", paths),
		[expandAllFolders]
	);
	const onExpandAllUntracked = useCallback(
		(paths: Set<string>) => expandAllFolders("untracked", paths),
		[expandAllFolders]
	);
	const onFoldAllStaged = useCallback(() => foldAllFolders("staged"), [foldAllFolders]);
	const onFoldAllUnstaged = useCallback(() => foldAllFolders("unstaged"), [foldAllFolders]);
	const onFoldAllUntracked = useCallback(() => foldAllFolders("untracked"), [foldAllFolders]);

	const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

	return (
		<aside className="flex h-full min-w-0 flex-1 flex-col bg-(--bg-sidebar)">
			{projects.length > 0 && activeProject && onProjectChange && (
				<div className="relative shrink-0 border-b border-(--border-secondary) px-3 py-2">
					<Popover open={projectSwitcherOpen} onOpenChange={setProjectSwitcherOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-(--bg-hover)"
							>
								<span className="truncate font-medium text-(--text-primary)">
									{activeProject.name}
								</span>
								<ChevronDown
									size={14}
									className={`ml-auto shrink-0 text-(--text-muted) transition-transform ${projectSwitcherOpen ? "rotate-180" : ""}`}
								/>
							</button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-auto"
						>
							{projects.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => {
										onProjectChange(p);
										setProjectSwitcherOpen(false);
									}}
									className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-(--bg-hover) ${
										activeProject.id === p.id ? "bg-(--bg-active)" : ""
									}`}
								>
									<span className="truncate font-medium text-(--text-primary)">
										{p.name}
									</span>
									<span className="truncate font-mono text-[10px] text-(--text-muted)">
										{p.path}
									</span>
								</button>
							))}
							{onAddProject && (
								<button
									type="button"
									onClick={() => {
										onAddProject();
										setProjectSwitcherOpen(false);
									}}
									className="flex w-full items-center gap-2 border-t border-(--border-secondary) px-3 py-2.5 text-sm text-(--text-secondary) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
								>
									<Plus size={14} />
									Add repository
								</button>
							)}
						</PopoverContent>
					</Popover>
				</div>
			)}
			<div className="flex items-center gap-2 border-b border-(--border-secondary) px-3 py-2.5">
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
						title="Back to projects"
					>
						<ChevronLeft size={16} />
					</button>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<GitBranch size={12} className="shrink-0 text-(--text-muted)" />
						<h2 className="section-title truncate">Changes</h2>
						{totalChanges > 0 && (
							<span className="ml-auto shrink-0 rounded-full bg-(--bg-tertiary) px-1.5 py-0.5 font-mono text-[10px] font-medium text-(--text-muted)">
								{totalChanges}
							</span>
						)}
					</div>
					<p
						className="mt-0.5 truncate font-mono text-[10px] text-(--text-subtle)"
						title={status.repoPath}
					>
						{status.repoPath}
					</p>
				</div>
			</div>
			<div className="min-w-0 flex-1 overflow-y-auto py-3">
				<FileTreeSection
					projectId={projectId}
					section="staged"
					title="Staged"
					count={status.staged.length}
					files={status.staged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					onRefresh={onRefresh}
					expandedFolders={expandedFoldersBySection.staged}
					onToggleFolder={(path) => toggleFolder("staged", path)}
					onExpandAll={onExpandAllStaged}
					onFoldAll={onFoldAllStaged}
					onViewAll={onViewAll}
				/>
				<FileTreeSection
					projectId={projectId}
					section="unstaged"
					title="Unstaged"
					count={status.unstaged.length}
					files={status.unstaged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					onRefresh={onRefresh}
					expandedFolders={expandedFoldersBySection.unstaged}
					onToggleFolder={(path) => toggleFolder("unstaged", path)}
					onExpandAll={onExpandAllUnstaged}
					onFoldAll={onFoldAllUnstaged}
					onViewAll={onViewAll}
				/>
				<FileTreeSection
					projectId={projectId}
					section="untracked"
					title="Untracked"
					count={status.untracked.length}
					files={status.untracked}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					onRefresh={onRefresh}
					expandedFolders={expandedFoldersBySection.untracked}
					onToggleFolder={(path) => toggleFolder("untracked", path)}
					onExpandAll={onExpandAllUntracked}
					onFoldAll={onFoldAllUntracked}
					onViewAll={onViewAll}
				/>
				{status.staged.length === 0 &&
					status.unstaged.length === 0 &&
					status.untracked.length === 0 && (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--bg-tertiary)">
								<GitBranch size={18} className="text-(--text-muted)" />
							</div>
							<div className="w-full text-center">
								<p className="text-xs font-medium text-(--text-muted)">
									No changes
								</p>
								<p className="mt-0.5 text-[11px] text-(--text-subtle)">
									Clean working directory
								</p>
							</div>
						</div>
					)}
			</div>
		</aside>
	);
}
