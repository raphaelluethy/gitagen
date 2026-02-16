import { useState, useMemo } from "react";
import {
	ChevronRight,
	ChevronDown,
	ChevronsDownUp,
	ChevronLeft,
	File,
	Folder,
	FolderOpen,
	GitBranch,
	Plus,
} from "lucide-react";
import type { GitStatus, GitFileStatus } from "../../../shared/types";
import type { Project } from "../../../shared/types";
import { changeTypeColorClass, changeTypeLabel } from "../utils/status-badge";

interface SidebarProps {
	status: GitStatus;
	selectedFile: GitFileStatus | null;
	onSelectFile: (file: GitFileStatus) => void;
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
	selectedFile,
	onSelect,
	expandedFolders,
	onToggleFolder,
}: {
	node: FileTreeNode;
	depth: number;
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
}) {
	const paddingLeft = depth * 16 + 12;

	if (node.type === "file" && node.file) {
		const isSelected =
			selectedFile?.path === node.file.path && selectedFile?.status === node.file.status;
		const letter = node.file.changeType ?? "M";
		const barColor = statusBarColor(letter);

		return (
			<button
				type="button"
				onClick={() => onSelect(node.file!)}
				className={`group flex w-full items-center gap-2 py-1.5 text-left text-[13px] outline-none transition-all ${
					isSelected
						? "bg-(--bg-active) text-(--text-primary)"
						: "text-(--text-primary) hover:bg-(--bg-hover)"
				}`}
				style={{
					paddingLeft,
					borderLeft: `2px solid ${isSelected ? "var(--text-muted)" : barColor}`,
				}}
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
		);
	}

	if (node.type === "folder" && node.children) {
		const isExpanded = expandedFolders.has(node.path);
		const childNodes = node.children as FileTreeNode[];

		return (
			<div key={node.path}>
				<button
					type="button"
					onClick={() => onToggleFolder(node.path)}
					className="group flex w-full items-center gap-2 py-1.5 text-left text-[13px] text-(--text-secondary) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					style={{ paddingLeft }}
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
				{isExpanded && (
					<div>
						{childNodes.map((child) => (
							<TreeItem
								key={child.path}
								node={child}
								depth={depth + 1}
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
	title,
	count,
	files,
	selectedFile,
	onSelect,
	expandedFolders,
	onToggleFolder,
	onExpandAll,
	onViewAll,
}: {
	title: string;
	count: number;
	files: GitFileStatus[];
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
	onExpandAll: (paths: Set<string>) => void;
	onViewAll?: (section: "staged" | "unstaged" | "untracked") => void;
}) {
	const tree = useMemo(() => buildFileTree(files), [files]);

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

	return (
		<div className="mb-4">
			<div className="mb-2 flex items-center justify-between px-3 py-2">
				<div className="flex items-center gap-2">
					<h3 className="section-title">{title}</h3>
					<span className="font-mono text-[10px] text-(--text-muted)">{count}</span>
					{count > 0 && onViewAll && (
						<button
							type="button"
							onClick={() => onViewAll(viewAllSection)}
							className="text-[10px] text-(--text-muted) outline-none hover:text-(--text-primary)"
						>
							View all
						</button>
					)}
				</div>
				<button
					type="button"
					onClick={expandAll}
					title="Expand all"
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-(--text-muted) outline-none hover:bg-(--bg-hover) hover:text-(--text-secondary)"
				>
					<ChevronsDownUp size={11} strokeWidth={2} />
					<span>expand</span>
				</button>
			</div>
			<div className="px-1">
				{tree.map((node) => (
					<TreeItem
						key={node.path}
						node={node}
						depth={0}
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
	status,
	selectedFile,
	onSelectFile,
	onBack,
	projects = [],
	activeProject,
	onProjectChange,
	onAddProject,
	onViewAll,
}: SidebarProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
	const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);

	const toggleFolder = (path: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const expandAllFolders = (paths: Set<string>) => {
		setExpandedFolders((prev) => new Set([...prev, ...paths]));
	};

	const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

	return (
		<aside className="flex h-full flex-col bg-(--bg-sidebar)">
			{projects.length > 0 && activeProject && onProjectChange && (
				<div className="relative shrink-0 border-b border-(--border-secondary) px-3 py-2">
					<button
						type="button"
						onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
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
					{projectSwitcherOpen && (
						<>
							<div
								className="fixed inset-0 z-40"
								onClick={() => setProjectSwitcherOpen(false)}
							/>
							<div className="dropdown absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto animate-scale-in">
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
							</div>
						</>
					)}
				</div>
			)}
			<div className="flex items-center gap-3 border-b border-(--border-secondary) px-4 py-3">
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
						title="Back to projects"
					>
						<ChevronLeft size={18} />
					</button>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<GitBranch size={14} className="text-(--text-primary)" />
						<h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-(--text-primary)">
							Changes
						</h2>
					</div>
					<p
						className="font-mono truncate text-[11px] text-(--text-muted)"
						title={status.repoPath}
					>
						{status.repoPath}
					</p>
				</div>
				{totalChanges > 0 && (
					<span className="font-mono text-[10px] text-(--text-muted)">
						{totalChanges}
					</span>
				)}
			</div>
			<div className="flex-1 overflow-y-auto py-3">
				<FileTreeSection
					title="Staged"
					count={status.staged.length}
					files={status.staged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
					onViewAll={onViewAll}
				/>
				<FileTreeSection
					title="Unstaged"
					count={status.unstaged.length}
					files={status.unstaged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
					onViewAll={onViewAll}
				/>
				<FileTreeSection
					title="Untracked"
					count={status.untracked.length}
					files={status.untracked}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
					onViewAll={onViewAll}
				/>
				{status.staged.length === 0 &&
					status.unstaged.length === 0 &&
					status.untracked.length === 0 && (
						<div className="px-4 py-8 text-center">
							<div className="mb-3 flex justify-center">
								<GitBranch size={32} className="text-(--border-primary)" />
							</div>
							<p className="text-sm font-medium text-(--text-muted)">No changes</p>
							<p className="mt-1 text-xs text-(--text-subtle)">
								Working directory is clean
							</p>
						</div>
					)}
			</div>
		</aside>
	);
}
