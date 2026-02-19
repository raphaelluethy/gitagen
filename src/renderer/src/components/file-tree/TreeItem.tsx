import { useCallback } from "react";
import { ChevronRight, File, Folder, FolderOpen, Minus, Plus, Trash2 } from "lucide-react";
import type { GitFileStatus } from "../../../../shared/types";
import type { FileTreeNode } from "./types";
import { collectFilePaths, statusBarColor } from "./utils";
import { changeTypeColorClass, changeTypeLabel } from "../../utils/status-badge";
import { useToast } from "../../toast/provider";
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "../ui/context-menu";

export interface TreeItemProps {
	node: FileTreeNode;
	depth: number;
	section: "staged" | "unstaged" | "untracked";
	projectId: string;
	onRefresh: () => void;
	selectedFile: GitFileStatus | null;
	onSelect: (file: GitFileStatus) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
}

export function TreeItem({
	node,
	depth,
	section,
	projectId,
	onRefresh,
	selectedFile,
	onSelect,
	expandedFolders,
	onToggleFolder,
}: TreeItemProps) {
	const { toast } = useToast();
	const paddingLeft = depth * 16 + 12;

	const isFile = node.type === "file" && node.file;
	const isFolder = node.type === "folder" && node.children;
	const isSelected =
		isFile &&
		selectedFile?.path === node.file!.path &&
		selectedFile?.status === node.file!.status;
	const letter = isFile ? (node.file!.changeType ?? "M") : "M";
	const barColor = statusBarColor(letter);
	const canStage = section === "unstaged" || section === "untracked";
	const isExpanded = isFolder && expandedFolders.has(node.path);
	const childNodes = isFolder ? (node.children as FileTreeNode[]) : [];
	const paths = isFolder ? collectFilePaths(node) : [];
	const isUntracked = section === "untracked";

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

	const handleDiscardFile = useCallback(async () => {
		if (!isFile) return;
		const confirmed = await window.gitagen.app.confirm({
			title: "Discard Changes",
			message: `Discard changes to "${node.name}"?`,
			detail: isUntracked
				? "This will permanently delete the file."
				: "This will restore the file to its last committed state.",
			confirmLabel: "Discard",
			cancelLabel: "Cancel",
		});
		if (!confirmed) return;
		try {
			if (isUntracked) {
				await window.gitagen.repo.deleteUntrackedFiles(projectId, [node.file!.path]);
			} else {
				await window.gitagen.repo.discardFiles(projectId, [node.file!.path]);
			}
			onRefresh();
			toast.success("Changes discarded");
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Discard failed", msg);
		}
	}, [projectId, node, isFile, isUntracked, onRefresh, toast]);

	const handleDiscardFolder = useCallback(async () => {
		if (paths.length === 0) return;
		const confirmed = await window.gitagen.app.confirm({
			title: "Discard Changes",
			message: `Discard changes to ${paths.length} file${paths.length > 1 ? "s" : ""} in "${node.name}"?`,
			detail: isUntracked
				? "This will permanently delete these files."
				: "This will restore the files to their last committed state.",
			confirmLabel: "Discard",
			cancelLabel: "Cancel",
		});
		if (!confirmed) return;
		try {
			if (isUntracked) {
				await window.gitagen.repo.deleteUntrackedFiles(projectId, paths);
			} else {
				await window.gitagen.repo.discardFiles(projectId, paths);
			}
			onRefresh();
			toast.success("Changes discarded");
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Discard failed", msg);
		}
	}, [projectId, paths, node.name, isUntracked, onRefresh, toast]);

	const handleOpenInEditor = useCallback(async () => {
		if (!isFile) return;
		try {
			await window.gitagen.repo.openInEditor(projectId, node.file!.path);
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Failed to open file", msg);
		}
	}, [projectId, node, isFile, toast]);

	if (isFile) {
		const fileContent = (
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
				<div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-120 group-hover:opacity-100">
					<button
						type="button"
						onClick={handleDiscardFile}
						className="rounded p-0.5 text-(--text-muted) transition-colors hover:bg-(--bg-tertiary) hover:text-(--danger)"
						title="Discard changes"
						aria-label="Discard changes"
					>
						<Trash2 size={14} strokeWidth={2} />
					</button>
					<button
						type="button"
						onClick={handleStage}
						className={`rounded p-0.5 text-(--text-muted) transition-colors hover:bg-(--bg-tertiary) ${
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
			</div>
		);

		return (
			<ContextMenu>
				<ContextMenuTrigger>{fileContent}</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={handleOpenInEditor}>
						<File size={14} strokeWidth={2} />
						Open in Editor
					</ContextMenuItem>
					<ContextMenuSeparator />
					{canStage && (
						<ContextMenuItem
							onClick={() =>
								window.gitagen.repo
									.stageFiles(projectId, [node.file!.path])
									.then(onRefresh)
							}
						>
							<Plus size={14} strokeWidth={2} />
							Stage file
						</ContextMenuItem>
					)}
					{!canStage && (
						<ContextMenuItem
							onClick={() =>
								window.gitagen.repo
									.unstageFiles(projectId, [node.file!.path])
									.then(onRefresh)
							}
						>
							<Minus size={14} strokeWidth={2} />
							Unstage file
						</ContextMenuItem>
					)}
					<ContextMenuItem onClick={handleDiscardFile} variant="destructive">
						<Trash2 size={14} strokeWidth={2} />
						Discard changes
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	if (isFolder) {
		const folderContent = (
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
						<div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-120 group-hover:opacity-100">
							<button
								type="button"
								onClick={handleDiscardFolder}
								className="rounded p-0.5 text-(--text-muted) transition-colors hover:bg-(--bg-tertiary) hover:text-(--danger)"
								title="Discard folder changes"
								aria-label="Discard folder changes"
							>
								<Trash2 size={14} strokeWidth={2} />
							</button>
							<button
								type="button"
								onClick={handleStageFolder}
								className={`rounded p-0.5 text-(--text-muted) transition-colors hover:bg-(--bg-tertiary) ${
									canStage
										? "hover:text-(--success)"
										: "hover:text-(--text-muted)"
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
						</div>
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

		return (
			<ContextMenu>
				<ContextMenuTrigger>{folderContent}</ContextMenuTrigger>
				<ContextMenuContent>
					{canStage && paths.length > 0 && (
						<ContextMenuItem
							onClick={() =>
								window.gitagen.repo.stageFiles(projectId, paths).then(onRefresh)
							}
						>
							<Plus size={14} strokeWidth={2} />
							Stage folder
						</ContextMenuItem>
					)}
					{!canStage && paths.length > 0 && (
						<ContextMenuItem
							onClick={() =>
								window.gitagen.repo.unstageFiles(projectId, paths).then(onRefresh)
							}
						>
							<Minus size={14} strokeWidth={2} />
							Unstage folder
						</ContextMenuItem>
					)}
					{paths.length > 0 && (
						<ContextMenuItem onClick={handleDiscardFolder} variant="destructive">
							<Trash2 size={14} strokeWidth={2} />
							Discard folder changes
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	return null;
}
