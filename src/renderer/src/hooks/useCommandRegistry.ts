import { useMemo } from "react";
import type {
	DiffStyle,
	GitFileStatus,
	GitStatus,
	Project,
	RepoStatus,
	StashEntry,
	WorktreeInfo,
} from "../../../shared/types";
import type { AppRouteId } from "../lib/appRoute";

export type RightPanelTab = "log" | "stash" | "remote";
export type ViewMode = "single" | "all";
export type SettingsTab = "general" | "git" | "signing" | "ai" | "appearance" | "dev";

export interface CommandContext {
	route: AppRouteId;
	projects: Project[];
	activeProject: Project | null;
	status: RepoStatus | null;
	gitStatus: GitStatus | null;
	activeWorktreePath: string | null;
	selectedFile: GitFileStatus | null;
	diffStyle: DiffStyle;
	viewMode: ViewMode;
	rightTab: RightPanelTab;
	selectedCommitOid: string | null;
	isLeftPanelCollapsed: boolean;
	isRightPanelCollapsed: boolean;
}

export interface CommandActions {
	onOpenProject: (project: Project) => void;
	onAddProject: () => Promise<void>;
	onBackToProjects: () => void;
	onOpenGitAgent: () => void;
	onOpenSettings: (tab?: SettingsTab) => void;
	onCloseSettings: () => void;
	onSetViewMode: (mode: ViewMode) => void;
	onSetDiffStyle: (style: DiffStyle) => void;
	onSetRightTab: (tab: RightPanelTab) => void;
	onToggleLeftPanel: () => void;
	onToggleRightPanel: () => void;
	onRefreshStatus: () => void;
	onRefreshStatusAndPrefs: () => void;
	onSelectFile: (file: GitFileStatus) => void;
	onOpenCommitDetail: (oid: string) => void;
	onCloseCommitDetail: () => void;
	onNotifyError: (message: string) => void;
}

export interface CommandConfirm {
	title: string;
	detail?: string;
	confirmLabel?: string;
	danger?: boolean;
}

export interface CommandSubItem {
	id: string;
	label: string;
	detail?: string;
	keywords?: string[];
	badge?: string;
	disabled?: boolean;
	disabledReason?: string;
	run: () => Promise<void> | void;
	confirm?: CommandConfirm;
}

export interface CommandInputSpec {
	title: string;
	placeholder: string;
	submitLabel?: string;
	initialValue?: string;
	validate?: (value: string) => string | null;
	run: (value: string) => Promise<void> | void;
}

export interface CommandItem {
	id: string;
	label: string;
	description: string;
	category: string;
	keywords: string[];
	disabled?: boolean;
	disabledReason?: string;
	run?: () => Promise<void> | void;
	confirm?: CommandConfirm;
	getSubItems?: () => Promise<CommandSubItem[]>;
	input?: CommandInputSpec;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim() !== "") {
		return error.message;
	}
	return fallback;
}

function isRepoRoute(route: AppRouteId): boolean {
	return route === "repo-workspace" || route === "repo-commit-detail";
}

function stringifyFile(file: GitFileStatus): string {
	return `${file.changeType ?? "M"} ${file.path}`;
}

function makeStashSubItem(
	entry: StashEntry,
	run: () => Promise<void>,
	confirm?: CommandConfirm
): CommandSubItem {
	return {
		id: `stash-${entry.index}`,
		label: `stash@{${entry.index}}`,
		detail: entry.message,
		keywords: [entry.message, String(entry.index)],
		run,
		confirm,
	};
}

export function useCommandRegistry(
	context: CommandContext,
	actions: CommandActions
): CommandItem[] {
	return useMemo(() => {
		const route = context.route;
		const project = context.activeProject;
		const projectId = project?.id ?? null;
		const repoRoute = isRepoRoute(route);
		const hasProject = project !== null;

		const runSafe = async (task: () => Promise<void>, fallback: string): Promise<void> => {
			try {
				await task();
			} catch (error) {
				actions.onNotifyError(getErrorMessage(error, fallback));
			}
		};

		const withProject = async (
			task: (id: string) => Promise<void>,
			fallback: string
		): Promise<void> => {
			if (!projectId) return;
			await runSafe(() => task(projectId), fallback);
		};

		const commands: CommandItem[] = [];

		if (context.projects.length > 0 && route !== "loading") {
			commands.push({
				id: "projects.open",
				label: "Open Repository…",
				description: "Switch to another repository",
				category: "Projects",
				keywords: ["project", "switch", "repo"],
				getSubItems: async () =>
					context.projects.map((candidate) => ({
						id: candidate.id,
						label: candidate.name,
						detail: candidate.path,
						keywords: [candidate.path],
						badge: candidate.id === projectId ? "current" : undefined,
						run: () => {
							actions.onOpenProject(candidate);
						},
					})),
			});
		}

		if (route !== "loading") {
			commands.push({
				id: "projects.add",
				label: "Add Repository…",
				description: "Pick a local folder and add it as project",
				category: "Projects",
				keywords: ["project", "repo", "folder"],
				run: async () => {
					await runSafe(() => actions.onAddProject(), "Failed to add repository");
				},
			});
		}

		if (hasProject && route !== "loading") {
			commands.push({
				id: "projects.back",
				label: "Back to Projects",
				description: "Return to the repository list",
				category: "Projects",
				keywords: ["home", "projects", "start"],
				run: () => {
					actions.onBackToProjects();
				},
			});
		}

		const canOpenSettings = hasProject && context.gitStatus !== null && route !== "settings";
		if (canOpenSettings) {
			commands.push({
				id: "nav.settings.open",
				label: "Open Settings",
				description: "Open application settings",
				category: "Navigation",
				keywords: ["preferences", "settings", "config"],
				run: () => {
					actions.onOpenSettings();
				},
			});
		}

		if (route === "settings") {
			commands.push({
				id: "nav.settings.close",
				label: "Close Settings",
				description: "Return to the repository view",
				category: "Navigation",
				keywords: ["back", "repo"],
				run: () => {
					actions.onCloseSettings();
				},
			});
		}

		if (route === "settings" || canOpenSettings) {
			const tabs: { id: SettingsTab; label: string }[] = [
				{ id: "general", label: "General" },
				{ id: "git", label: "Git" },
				{ id: "signing", label: "Signing" },
				{ id: "ai", label: "AI" },
				{ id: "appearance", label: "Appearance" },
				{ id: "dev", label: "Dev" },
			];
			for (const tab of tabs) {
				commands.push({
					id: `nav.settings.tab.${tab.id}`,
					label: `Settings: ${tab.label}`,
					description:
						route === "settings"
							? `Switch to ${tab.label} settings tab`
							: `Open settings at ${tab.label} tab`,
					category: "Settings",
					keywords: ["settings", tab.id],
					run: () => {
						actions.onOpenSettings(tab.id);
					},
				});
			}
		}

		if (hasProject) {
			commands.push({
				id: "repo.refresh",
				label: "Refresh Status",
				description: "Reload repository status",
				category: "Repository",
				keywords: ["reload", "refresh", "status"],
				run: () => {
					actions.onRefreshStatus();
				},
			});
		}

		if (repoRoute) {
			commands.push({
				id: "ai.gitagent.open",
				label: "Open GitAgent",
				description: "Open AI assistant for git workflows",
				category: "AI",
				keywords: ["ai", "agent", "gitagent", "assistant", "commit"],
				run: () => {
					actions.onOpenGitAgent();
				},
			});

			commands.push({
				id: "nav.left.toggle",
				label: context.isLeftPanelCollapsed ? "Show Left Panel" : "Hide Left Panel",
				description: "Toggle sidebar visibility",
				category: "Navigation",
				keywords: ["sidebar", "left", "panel"],
				run: () => {
					actions.onToggleLeftPanel();
				},
			});
			commands.push({
				id: "nav.right.toggle",
				label: context.isRightPanelCollapsed ? "Show Right Panel" : "Hide Right Panel",
				description: "Toggle right panel visibility",
				category: "Navigation",
				keywords: ["right", "panel", "log", "stash", "remote"],
				run: () => {
					actions.onToggleRightPanel();
				},
			});
			commands.push({
				id: "nav.view.single",
				label: "View: Single File",
				description: "Show single-file diff view",
				category: "Navigation",
				keywords: ["view", "single", "diff"],
				run: () => {
					actions.onSetViewMode("single");
				},
			});
			commands.push({
				id: "nav.view.all",
				label: "View: All Changes",
				description: "Show all changed files",
				category: "Navigation",
				keywords: ["view", "all", "changes"],
				run: () => {
					actions.onSetViewMode("all");
				},
			});
			commands.push({
				id: "nav.diff.unified",
				label: "Diff Style: Unified",
				description: "Use unified diff layout",
				category: "Navigation",
				keywords: ["diff", "unified", "style"],
				run: () => {
					actions.onSetDiffStyle("unified");
				},
			});
			commands.push({
				id: "nav.diff.split",
				label: "Diff Style: Split",
				description: "Use split diff layout",
				category: "Navigation",
				keywords: ["diff", "split", "style"],
				run: () => {
					actions.onSetDiffStyle("split");
				},
			});
			commands.push({
				id: "nav.tab.log",
				label: "Right Panel: Log",
				description: "Show commit history tab",
				category: "Navigation",
				keywords: ["right", "log", "history"],
				run: () => {
					actions.onSetRightTab("log");
				},
			});
			commands.push({
				id: "nav.tab.stash",
				label: "Right Panel: Stash",
				description: "Show stash entries tab",
				category: "Navigation",
				keywords: ["right", "stash"],
				run: () => {
					actions.onSetRightTab("stash");
				},
			});
			commands.push({
				id: "nav.tab.remote",
				label: "Right Panel: Remote",
				description: "Show remotes and sync actions tab",
				category: "Navigation",
				keywords: ["right", "remote", "fetch", "pull", "push"],
				run: () => {
					actions.onSetRightTab("remote");
				},
			});

			commands.push({
				id: "branch.switch",
				label: "Switch Branch…",
				description: "Choose and checkout another branch",
				category: "Branch",
				keywords: ["checkout", "branch", "switch"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const branches = await window.gitagen.repo.listBranches(projectId);
						return branches.map((branch) => ({
							id: branch.name,
							label: branch.name,
							detail:
								branch.tracking && branch.tracking.trim() !== ""
									? `${branch.tracking} • +${branch.ahead}/-${branch.behind}`
									: `+${branch.ahead}/-${branch.behind}`,
							badge: branch.current ? "current" : undefined,
							keywords: [branch.tracking ?? ""],
							run: async () => {
								await withProject(async (id) => {
									await window.gitagen.repo.switchBranch(id, branch.name);
									actions.onRefreshStatus();
								}, "Failed to switch branch");
							},
						}));
					} catch (error) {
						actions.onNotifyError(getErrorMessage(error, "Failed to list branches"));
						return [];
					}
				},
			});

			commands.push({
				id: "worktree.switch",
				label: "Switch Worktree…",
				description: "Change active worktree for this project",
				category: "Worktree",
				keywords: ["worktree", "switch"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const worktrees = await window.gitagen.repo.listWorktrees(projectId);
						const currentPath = context.activeWorktreePath ?? project?.path ?? null;
						return worktrees.map((worktree: WorktreeInfo) => {
							const isMain = worktree.isMainWorktree;
							const isCurrent = worktree.path === currentPath;
							const displayName =
								worktree.name || worktree.path.split("/").pop() || worktree.path;
							return {
								id: worktree.path,
								label: displayName,
								detail: `${worktree.branch} • ${worktree.path}`,
								badge: isCurrent ? "current" : isMain ? "main" : undefined,
								run: async () => {
									if (!projectId) return;
									await runSafe(async () => {
										await window.gitagen.settings.setProjectPrefs(projectId, {
											activeWorktreePath: isMain ? null : worktree.path,
										});
										actions.onRefreshStatusAndPrefs();
									}, "Failed to switch worktree");
								},
							};
						});
					} catch (error) {
						actions.onNotifyError(getErrorMessage(error, "Failed to list worktrees"));
						return [];
					}
				},
			});

			commands.push({
				id: "worktree.create",
				label: "Create Worktree…",
				description: "Create a new worktree for a branch",
				category: "Worktree",
				keywords: ["worktree", "create", "branch"],
				input: {
					title: "Create Worktree",
					placeholder: "Branch name (e.g. feature/new-flow)",
					submitLabel: "Create",
					initialValue: context.status?.branch || "",
					validate: (value: string) => {
						if (value.trim() === "") return "Branch name is required";
						return null;
					},
					run: async (value: string) => {
						await withProject(async (id) => {
							await window.gitagen.repo.addWorktree(id, value.trim());
							actions.onRefreshStatusAndPrefs();
						}, "Failed to create worktree");
					},
				},
			});

			commands.push({
				id: "worktree.prune",
				label: "Clean Stale Worktrees…",
				description: "Prune stale worktree metadata",
				category: "Worktree",
				keywords: ["clean", "prune", "worktree"],
				confirm: {
					title: "Clean stale worktrees?",
					confirmLabel: "Clean",
				},
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.pruneWorktrees(id);
						actions.onRefreshStatusAndPrefs();
					}, "Failed to clean worktrees");
				},
			});

			commands.push({
				id: "worktree.remove",
				label: "Remove Worktree…",
				description: "Remove an existing worktree",
				category: "Worktree",
				keywords: ["worktree", "remove", "delete"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const currentPath = context.activeWorktreePath ?? project?.path ?? "";
						const worktrees = await window.gitagen.repo.listWorktrees(projectId);
						return worktrees
							.filter((worktree) => !worktree.isMainWorktree)
							.map((worktree) => {
								const displayName =
									worktree.name ||
									worktree.path.split("/").pop() ||
									worktree.path;
								const isCurrent = worktree.path === currentPath;
								return {
									id: worktree.path,
									label: displayName,
									detail: `${worktree.branch} • ${worktree.path}`,
									badge: isCurrent ? "current" : undefined,
									run: async () => {
										await withProject(async (id) => {
											await window.gitagen.repo.removeWorktree(
												id,
												worktree.path
											);
											actions.onRefreshStatusAndPrefs();
										}, "Failed to remove worktree");
									},
									confirm: {
										title: `Remove worktree "${displayName}"?`,
										detail: worktree.path,
										confirmLabel: "Remove",
										danger: true,
									},
								} satisfies CommandSubItem;
							});
					} catch (error) {
						actions.onNotifyError(getErrorMessage(error, "Failed to list worktrees"));
						return [];
					}
				},
			});

			commands.push({
				id: "remote.fetch",
				label: "Fetch",
				description: "Fetch from remote with prune",
				category: "Remote",
				keywords: ["fetch", "remote"],
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.fetch(id, { prune: true });
						actions.onRefreshStatus();
					}, "Failed to fetch");
				},
			});
			commands.push({
				id: "remote.pull",
				label: "Pull",
				description: "Pull latest changes",
				category: "Remote",
				keywords: ["pull", "remote"],
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.pull(id);
						actions.onRefreshStatus();
					}, "Failed to pull");
				},
			});
			commands.push({
				id: "remote.push",
				label: "Push",
				description: "Push current branch",
				category: "Remote",
				keywords: ["push", "remote"],
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.push(id);
						actions.onRefreshStatus();
					}, "Failed to push");
				},
			});

			commands.push({
				id: "staging.stageAll",
				label: "Stage All",
				description: "Stage all changed files",
				category: "Staging",
				keywords: ["stage", "all", "add"],
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.stageAll(id);
						actions.onRefreshStatus();
					}, "Failed to stage all files");
				},
			});
			commands.push({
				id: "staging.unstageAll",
				label: "Unstage All",
				description: "Unstage all staged files",
				category: "Staging",
				keywords: ["unstage", "reset", "all"],
				run: async () => {
					await withProject(async (id) => {
						await window.gitagen.repo.unstageAll(id);
						actions.onRefreshStatus();
					}, "Failed to unstage all files");
				},
			});

			commands.push({
				id: "file.select",
				label: "Select Changed File…",
				description: "Move focus to a changed file",
				category: "File",
				keywords: ["file", "select", "diff"],
				getSubItems: async () => {
					const files = context.gitStatus
						? [
								...context.gitStatus.staged,
								...context.gitStatus.unstaged,
								...context.gitStatus.untracked,
							]
						: [];
					return files.map((file) => ({
						id: `${file.status}:${file.path}`,
						label: file.path,
						detail: `${file.status} • ${file.changeType ?? "M"}`,
						keywords: [stringifyFile(file), file.status],
						run: () => {
							actions.onSelectFile(file);
						},
					}));
				},
			});

			const selectedFile = context.selectedFile;
			const canStageSelected = selectedFile != null && selectedFile.status !== "staged";
			const canUnstageSelected = selectedFile != null && selectedFile.status === "staged";
			commands.push({
				id: "file.stageSelected",
				label: "Stage Selected File",
				description: "Stage currently selected file",
				category: "File",
				keywords: ["stage", "selected", "file"],
				disabled: !canStageSelected,
				disabledReason: selectedFile
					? "Selected file is already staged"
					: "No selected file",
				run: async () => {
					if (!selectedFile || selectedFile.status === "staged") return;
					await withProject(async (id) => {
						await window.gitagen.repo.stageFiles(id, [selectedFile.path]);
						actions.onRefreshStatus();
					}, "Failed to stage selected file");
				},
			});
			commands.push({
				id: "file.unstageSelected",
				label: "Unstage Selected File",
				description: "Unstage currently selected file",
				category: "File",
				keywords: ["unstage", "selected", "file"],
				disabled: !canUnstageSelected,
				disabledReason: selectedFile ? "Selected file is not staged" : "No selected file",
				run: async () => {
					if (!selectedFile || selectedFile.status !== "staged") return;
					await withProject(async (id) => {
						await window.gitagen.repo.unstageFiles(id, [selectedFile.path]);
						actions.onRefreshStatus();
					}, "Failed to unstage selected file");
				},
			});
			commands.push({
				id: "file.openEditor",
				label: "Open Selected File in Editor",
				description: "Open selected file in external editor",
				category: "File",
				keywords: ["open", "editor", "selected"],
				disabled: selectedFile == null,
				disabledReason: selectedFile ? undefined : "No selected file",
				run: async () => {
					if (!selectedFile) return;
					await withProject(async (id) => {
						await window.gitagen.repo.openInEditor(id, selectedFile.path);
					}, "Failed to open file in editor");
				},
			});

			commands.push({
				id: "stash.pop",
				label: "Pop Stash…",
				description: "Pop a stash entry",
				category: "Stash",
				keywords: ["stash", "pop"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const entries = await window.gitagen.repo.stashList(projectId);
						return entries.map((entry) =>
							makeStashSubItem(entry, async () => {
								await withProject(async (id) => {
									await window.gitagen.repo.stashPop(id, entry.index);
									actions.onRefreshStatus();
								}, "Failed to pop stash");
							})
						);
					} catch (error) {
						actions.onNotifyError(
							getErrorMessage(error, "Failed to list stash entries")
						);
						return [];
					}
				},
			});
			commands.push({
				id: "stash.apply",
				label: "Apply Stash…",
				description: "Apply a stash entry",
				category: "Stash",
				keywords: ["stash", "apply"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const entries = await window.gitagen.repo.stashList(projectId);
						return entries.map((entry) =>
							makeStashSubItem(entry, async () => {
								await withProject(async (id) => {
									await window.gitagen.repo.stashApply(id, entry.index);
									actions.onRefreshStatus();
								}, "Failed to apply stash");
							})
						);
					} catch (error) {
						actions.onNotifyError(
							getErrorMessage(error, "Failed to list stash entries")
						);
						return [];
					}
				},
			});
			commands.push({
				id: "stash.drop",
				label: "Drop Stash…",
				description: "Delete a stash entry",
				category: "Stash",
				keywords: ["stash", "drop", "delete"],
				getSubItems: async () => {
					if (!projectId) return [];
					try {
						const entries = await window.gitagen.repo.stashList(projectId);
						return entries.map((entry) =>
							makeStashSubItem(
								entry,
								async () => {
									await withProject(async (id) => {
										await window.gitagen.repo.stashDrop(id, entry.index);
										actions.onRefreshStatus();
									}, "Failed to drop stash");
								},
								{
									title: `Drop stash@{${entry.index}}?`,
									detail: entry.message,
									confirmLabel: "Drop",
									danger: true,
								}
							)
						);
					} catch (error) {
						actions.onNotifyError(
							getErrorMessage(error, "Failed to list stash entries")
						);
						return [];
					}
				},
			});

			if (route === "repo-workspace") {
				commands.push({
					id: "history.open",
					label: "Open Commit Detail…",
					description: "Open a commit from recent history",
					category: "History",
					keywords: ["history", "log", "commit"],
					getSubItems: async () => {
						if (!projectId) return [];
						try {
							const commits = await window.gitagen.repo.getLog(projectId, {
								limit: 50,
							});
							return commits.map((commit) => ({
								id: commit.oid,
								label: commit.message.split("\n")[0] || commit.oid.slice(0, 7),
								detail: `${commit.oid.slice(0, 7)} • ${commit.author.name}`,
								keywords: [commit.oid, commit.author.name],
								run: () => {
									actions.onOpenCommitDetail(commit.oid);
								},
							}));
						} catch (error) {
							actions.onNotifyError(
								getErrorMessage(error, "Failed to load commit history")
							);
							return [];
						}
					},
				});
			}

			if (route === "repo-commit-detail") {
				commands.push({
					id: "history.close",
					label: "Close Commit Detail",
					description: "Return to working directory view",
					category: "History",
					keywords: ["close", "back", "commit"],
					run: () => {
						actions.onCloseCommitDetail();
					},
				});
			}
		}

		return commands;
	}, [actions, context]);
}
