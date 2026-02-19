import { useState, useCallback, useMemo } from "react";
import { useToast } from "../toast/provider";
import { FileTreeSection } from "./file-tree/FileTreeSection";
import { ProjectSwitcher } from "./sidebar/ProjectSwitcher";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarEmptyState } from "./sidebar/SidebarEmptyState";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore, selectGitStatus } from "../stores/repoStore";
import { useUIStore } from "../stores/uiStore";

type SectionKey = "staged" | "unstaged" | "untracked";

export default function Sidebar() {
	const projects = useProjectStore((s) => s.projects);
	const activeProject = useProjectStore((s) => s.activeProject);
	const status = useRepoStore((s) => s.status);
	const selectedFile = useRepoStore((s) => s.selectedFile);
	const projectId = activeProject?.id ?? "";
	const gitStatus = useMemo(
		() => selectGitStatus(status, activeProject?.path),
		[status, activeProject?.path]
	);
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

	const totalChanges = gitStatus
		? gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length
		: 0;

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
			void useRepoStore.getState().refreshStatus();
			toast.success("All changes discarded");
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			toast.error("Discard failed", msg);
		}
	}, [projectId, totalChanges, toast]);

	const hasChanges =
		(gitStatus?.staged.length ?? 0) > 0 ||
		(gitStatus?.unstaged.length ?? 0) > 0 ||
		(gitStatus?.untracked.length ?? 0) > 0;

	if (!gitStatus) return null;

	return (
		<aside className="flex h-full min-w-0 flex-1 flex-col bg-(--bg-sidebar)">
			{projects.length > 0 && activeProject && (
				<ProjectSwitcher
					projects={projects}
					activeProject={activeProject}
					onProjectChange={useProjectStore.getState().setActiveProject}
					onAddProject={() => void useProjectStore.getState().addProject()}
				/>
			)}
			<SidebarHeader
				repoPath={gitStatus.repoPath}
				totalChanges={totalChanges}
				onBack={() => useProjectStore.getState().setActiveProject(null)}
				onDiscardAll={handleDiscardAll}
			/>
			<div className="min-w-0 flex-1 overflow-y-auto py-3">
				<FileTreeSection
					projectId={projectId}
					section="staged"
					title="Staged"
					count={gitStatus.staged.length}
					files={gitStatus.staged}
					selectedFile={selectedFile}
					onSelect={useRepoStore.getState().setSelectedFileAndClearCommit}
					onRefresh={() => void useRepoStore.getState().refreshStatus()}
					expandedFolders={expandedFoldersBySection.staged}
					onToggleFolder={(path) => toggleFolder("staged", path)}
					onExpandAll={onExpandAllStaged}
					onFoldAll={onFoldAllStaged}
					onViewAll={() => useUIStore.getState().setViewMode("all")}
				/>
				<FileTreeSection
					projectId={projectId}
					section="unstaged"
					title="Unstaged"
					count={gitStatus.unstaged.length}
					files={gitStatus.unstaged}
					selectedFile={selectedFile}
					onSelect={useRepoStore.getState().setSelectedFileAndClearCommit}
					onRefresh={() => void useRepoStore.getState().refreshStatus()}
					expandedFolders={expandedFoldersBySection.unstaged}
					onToggleFolder={(path) => toggleFolder("unstaged", path)}
					onExpandAll={onExpandAllUnstaged}
					onFoldAll={onFoldAllUnstaged}
					onViewAll={() => useUIStore.getState().setViewMode("all")}
				/>
				<FileTreeSection
					projectId={projectId}
					section="untracked"
					title="Untracked"
					count={gitStatus.untracked.length}
					files={gitStatus.untracked}
					selectedFile={selectedFile}
					onSelect={useRepoStore.getState().setSelectedFileAndClearCommit}
					onRefresh={() => void useRepoStore.getState().refreshStatus()}
					expandedFolders={expandedFoldersBySection.untracked}
					onToggleFolder={(path) => toggleFolder("untracked", path)}
					onExpandAll={onExpandAllUntracked}
					onFoldAll={onFoldAllUntracked}
					onViewAll={() => useUIStore.getState().setViewMode("all")}
				/>
				{!hasChanges && <SidebarEmptyState />}
			</div>
		</aside>
	);
}
