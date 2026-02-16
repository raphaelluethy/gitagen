import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronsDownUp, File, Folder, FolderOpen } from "lucide-react";
import type { GitStatus, GitFileStatus } from "../../../shared/types";

interface SidebarProps {
	status: GitStatus;
	selectedFile: GitFileStatus | null;
	onSelectFile: (file: GitFileStatus) => void;
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
	const paddingLeft = depth * 12 + 12;

	if (node.type === "file" && node.file) {
		const isSelected =
			selectedFile?.path === node.file.path && selectedFile?.status === node.file.status;
		return (
			<button
				type="button"
				onClick={() => onSelect(node.file!)}
				className={`flex w-full items-center gap-2 py-1.5 text-left text-sm transition-colors`}
				style={{ paddingLeft }}
				title={node.path}
			>
				<File size={14} className="shrink-0 text-zinc-500" strokeWidth={2} />
				<span
					className={`block truncate ${isSelected ? "bg-zinc-700 text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"}`}
				>
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
					className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					style={{ paddingLeft }}
				>
					{isExpanded ? (
						<ChevronDown size={14} className="shrink-0" strokeWidth={2} />
					) : (
						<ChevronRight size={14} className="shrink-0" strokeWidth={2} />
					)}
					{isExpanded ? (
						<FolderOpen size={14} className="shrink-0 text-amber-600/80" strokeWidth={2} />
					) : (
						<Folder size={14} className="shrink-0 text-amber-600/80" strokeWidth={2} />
					)}
					<span className="truncate">{node.name}</span>
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
	files,
	selectedFile,
	onSelect,
	expandedFolders,
	onToggleFolder,
	onExpandAll,
}: {
	title: string;
	files: GitFileStatus[];
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
	onExpandAll: (paths: Set<string>) => void;
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

	return (
		<div className="mb-4">
			<div className="mb-1 flex items-center justify-between px-3 py-1">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
				<button
					type="button"
					onClick={expandAll}
					title="Expand all"
					className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-400"
				>
					<ChevronsDownUp size={12} strokeWidth={2} />
					expand
				</button>
			</div>
			<div>
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

export default function Sidebar({ status, selectedFile, onSelectFile }: SidebarProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

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

	return (
		<aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
			<div className="border-b border-zinc-800 px-3 py-3">
				<p className="truncate text-xs font-medium text-zinc-500" title={status.repoPath}>
					{status.repoPath}
				</p>
				<h2 className="text-sm font-semibold text-zinc-200">Changes</h2>
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				<FileTreeSection
					title="Staged"
					files={status.staged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
				/>
				<FileTreeSection
					title="Unstaged"
					files={status.unstaged}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
				/>
				<FileTreeSection
					title="Untracked"
					files={status.untracked}
					selectedFile={selectedFile}
					onSelect={onSelectFile}
					expandedFolders={expandedFolders}
					onToggleFolder={toggleFolder}
					onExpandAll={expandAllFolders}
				/>
				{status.staged.length === 0 &&
					status.unstaged.length === 0 &&
					status.untracked.length === 0 && (
						<p className="px-3 py-4 text-sm text-zinc-500">No changes</p>
					)}
			</div>
		</aside>
	);
}
