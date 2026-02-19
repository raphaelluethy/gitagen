import { useState, useCallback } from "react";
import type { GitStatus, GitFileStatus } from "../../../shared/types";
import type { Project } from "../../../shared/types";
import { useToast } from "../toast/provider";
import { FileTreeSection } from "./file-tree/FileTreeSection";
import { ProjectSwitcher } from "./sidebar/ProjectSwitcher";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarEmptyState } from "./sidebar/SidebarEmptyState";

export interface SidebarProps {
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

type SectionKey = "staged" | "unstaged" | "untracked";

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
	const { toast } = useToast();
	const [expandedFoldersBySection, setExpandedFoldersBySection] = useState<
		Record<SectionKey, Set<string>>
	>(() => ({
		staged: new Set(),
		unstaged: new Set(),
		untracked: new Set(),
	}));

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

	const handleDiscardAll = useCallback(async () => {
		if (totalChanges === 0) return;
		const confirmed = await window.gitagen.app.confirm({
			title: "Discard All Changes",
			message: `Discard all ${totalChanges} change${totalChanges > 1 ? "s" : ""}?`,
			detail: "This will restore all files to their last committed state and delete untracked files. This action cannot be undone.",
			confirmLabel: "Discard All",
			cancelLabel: "Cancel",
		});
		if (!confirmed) return;
		try {
			await window.gitagen.repo.discardAll(projectId);
			onRefresh();
			toast.success("All changes discarded");
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Discard failed", msg);
		}
	}, [projectId, totalChanges, onRefresh, toast]);

	const hasChanges =
		status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;

	return (
		<aside className="flex h-full min-w-0 flex-1 flex-col bg-(--bg-sidebar)">
			{projects.length > 0 && activeProject && onProjectChange && (
				<ProjectSwitcher
					projects={projects}
					activeProject={activeProject}
					onProjectChange={onProjectChange}
					onAddProject={onAddProject}
				/>
			)}
			<SidebarHeader
				repoPath={status.repoPath}
				totalChanges={totalChanges}
				onBack={onBack}
				onDiscardAll={handleDiscardAll}
			/>
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
				{!hasChanges && <SidebarEmptyState />}
			</div>
		</aside>
	);
}
