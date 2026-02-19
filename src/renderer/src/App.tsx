/// <reference lib="dom" />
import {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
	useReducer,
	Component,
	type ReactNode,
	type ErrorInfo,
} from "react";
import {
	Group,
	Panel,
	Separator,
	useDefaultLayout,
	type PanelImperativeHandle,
} from "react-resizable-panels";
import {
	Rows3,
	Columns,
	Plus,
	FolderOpen,
	Settings,
	History,
	Archive,
	Cloud,
	FileStack,
	FileText,
	PanelRightClose,
	PanelRight,
	PanelLeftClose,
	PanelLeft,
	ArrowLeft,
	GitBranch,
	FolderTree,
	ChevronRight,
	Key,
	Sparkles,
	Palette,
	Bug,
	Link,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import CommandPalette from "./components/CommandPalette";
import DiffViewer from "./components/DiffViewer";
import AllChangesView from "./components/AllChangesView";
import CommitPanel from "./components/CommitPanel";
import BranchSelector from "./components/BranchSelector";
import WorktreeSelector from "./components/WorktreeSelector";
import LogPanel from "./components/LogPanel";
import CommitDetailView from "./components/CommitDetailView";
import StashPanel from "./components/StashPanel";
import StashDetailView from "./components/StashDetailView";
import StashDialog from "./components/StashDialog";
import WorktreePanel from "./components/WorktreePanel";
import RemotePanel from "./components/RemotePanel";
import SyncButtons from "./components/SyncButtons";
import ConflictBanner from "./components/ConflictBanner";
import GitAgentModal from "./components/GitAgentModal";
import StartPage from "./components/StartPage";
import { FpsMonitor } from "./components/FpsMonitor";
import { Dialog, DialogContent } from "./components/ui/dialog";
import { ModalShell } from "./components/ui/modal-shell";
import { ThemeProvider, useTheme } from "./theme/provider";
import { SettingsProvider, useSettings } from "./settings/provider";
import { ToastProvider, useToast } from "./toast/provider";
import { parseRemoteForLinks } from "./utils/commit-links";
import { getAppRouteId } from "./lib/appRoute";
import {
	useCommandRegistry,
	type CommandActions,
	type CommandContext,
	type RightPanelTab,
	type SettingsTab,
	type ViewMode,
} from "./hooks/useCommandRegistry";
import type {
	CommitInfo,
	Project,
	RepoStatus,
	GitStatus,
	GitFileStatus,
	DiffStyle,
	ConfigEntry,
	AppSettings,
	AIProviderDescriptor,
	CommitStyle,
	AIProviderInstance,
	AIProviderType,
	ConflictState,
	FontFamily,
	BranchInfo,
	RemoteInfo,
} from "../../shared/types";

const MAIN_LAYOUT_FALLBACK = [20, 80];
const CONTENT_LAYOUT_FALLBACK = [70, 30];
const LAST_PROJECT_KEY = "gitagen:lastProjectId";
const COMMIT_AGENT_INITIAL_PROMPT =
	"Analyze all changes and propose 1 cohesive commit by default (maximum 2 only when there is a strong boundary).";

type Layout = { [id: string]: number };

interface RepoState {
	status: RepoStatus | null;
	currentBranchInfo: BranchInfo | null;
	remotes: RemoteInfo[];
	activeWorktreePath: string | null;
	cachedLog: {
		projectId: string;
		commits: CommitInfo[];
		unpushedOids: string[] | null;
	} | null;
}

type RepoAction =
	| { type: "SET_STATUS"; payload: RepoStatus | null }
	| { type: "SET_BRANCH_INFO"; payload: BranchInfo | null }
	| { type: "SET_REMOTES"; payload: RemoteInfo[] }
	| { type: "SET_WORKTREE_PATH"; payload: string | null }
	| { type: "SET_CACHED_LOG"; payload: RepoState["cachedLog"] }
	| { type: "CLEAR_REPO_STATE" };

function repoReducer(state: RepoState, action: RepoAction): RepoState {
	switch (action.type) {
		case "SET_STATUS":
			return { ...state, status: action.payload };
		case "SET_BRANCH_INFO":
			return { ...state, currentBranchInfo: action.payload };
		case "SET_REMOTES":
			return { ...state, remotes: action.payload };
		case "SET_WORKTREE_PATH":
			return { ...state, activeWorktreePath: action.payload };
		case "SET_CACHED_LOG":
			return { ...state, cachedLog: action.payload };
		case "CLEAR_REPO_STATE":
			return {
				status: null,
				currentBranchInfo: null,
				remotes: [],
				activeWorktreePath: null,
				cachedLog: null,
			};
		default:
			return state;
	}
}

const initialRepoState: RepoState = {
	status: null,
	currentBranchInfo: null,
	remotes: [],
	activeWorktreePath: null,
	cachedLog: null,
};

function sanitizeTwoPanelLayout(
	layout: unknown,
	opts: {
		fallback: number[];
		firstMin: number;
		firstMax: number;
		secondMin: number;
		secondMax: number;
		allowSecondCollapse?: boolean;
		allowFirstCollapse?: boolean;
		panelIds: [string, string];
	}
): Layout {
	let firstRaw: unknown;
	let secondRaw: unknown;
	if (Array.isArray(layout) && layout.length === 2) {
		[firstRaw, secondRaw] = layout;
	} else if (
		layout !== null &&
		typeof layout === "object" &&
		opts.panelIds[0] in layout &&
		opts.panelIds[1] in layout
	) {
		firstRaw = (layout as Layout)[opts.panelIds[0]];
		secondRaw = (layout as Layout)[opts.panelIds[1]];
	} else {
		const [a, b] = opts.fallback;
		return { [opts.panelIds[0]]: a, [opts.panelIds[1]]: b };
	}
	const first = typeof firstRaw === "number" ? firstRaw : Number.NaN;
	const second = typeof secondRaw === "number" ? secondRaw : Number.NaN;
	if (!Number.isFinite(first) || !Number.isFinite(second)) {
		const [a, b] = opts.fallback;
		return { [opts.panelIds[0]]: a, [opts.panelIds[1]]: b };
	}

	const total = first + second;
	if (Math.abs(total - 100) > 0.5) {
		const [a, b] = opts.fallback;
		return { [opts.panelIds[0]]: a, [opts.panelIds[1]]: b };
	}

	const firstMin = opts.allowFirstCollapse ? 0 : opts.firstMin;
	if (first < firstMin || first > opts.firstMax) {
		const [a, b] = opts.fallback;
		return { [opts.panelIds[0]]: a, [opts.panelIds[1]]: b };
	}

	const secondMin = opts.allowSecondCollapse ? 0 : opts.secondMin;
	if (second < secondMin || second > opts.secondMax) {
		const [a, b] = opts.fallback;
		return { [opts.panelIds[0]]: a, [opts.panelIds[1]]: b };
	}

	return { [opts.panelIds[0]]: first, [opts.panelIds[1]]: second };
}

function repoStatusToGitFileStatus(
	status: RepoStatus,
	type: "staged" | "unstaged" | "untracked"
): GitFileStatus[] {
	const items =
		type === "staged"
			? status.staged
			: type === "unstaged"
				? status.unstaged
				: status.untracked;
	return items.map((item) => ({
		path: typeof item === "string" ? item : item.path,
		status: type,
		changeType: typeof item === "string" ? "M" : item.changeType,
	}));
}

function getLatestConfigValue(entries: ConfigEntry[], key: string): string {
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i]?.key === key) return entries[i]?.value ?? "";
	}
	return "";
}

function getLatestConfigEntry(entries: ConfigEntry[], key: string): ConfigEntry | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i]?.key === key) return entries[i] ?? null;
	}
	return null;
}

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return (
				<div className="flex h-screen flex-col items-center justify-center gap-4 bg-(--bg-primary) p-8">
					<h1 className="text-lg font-semibold text-(--text-primary)">
						Something went wrong
					</h1>
					<p className="max-w-md text-center text-sm text-(--text-muted)">
						An unexpected error occurred. Please restart the application.
					</p>
					<details className="w-full max-w-md">
						<summary className="cursor-pointer text-xs text-(--text-muted)">
							Error details
						</summary>
						<pre className="mt-2 overflow-auto rounded bg-(--bg-secondary) p-2 text-xs text-(--danger)">
							{this.state.error?.message}
							{"\n"}
							{this.state.error?.stack}
						</pre>
					</details>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="btn btn-primary"
					>
						Restart App
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

function AppContent() {
	const { toast } = useToast();
	const { settings: appSettings } = useSettings();
	const [projects, setProjects] = useState<Project[]>([]);
	const [activeProject, setActiveProject] = useState<Project | null>(null);
	const [repoState, dispatch] = useReducer(repoReducer, initialRepoState);
	const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
	const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");
	const [viewMode, setViewMode] = useState<ViewMode>("single");
	const [showSettings, setShowSettings] = useState(false);
	const [showGitAgent, setShowGitAgent] = useState(false);
	const [gitAgentInitialPrompt, setGitAgentInitialPrompt] = useState<string | undefined>(
		undefined
	);
	const [rightTab, setRightTab] = useState<RightPanelTab>("log");
	const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
	const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null);
	const [showStashDialog, setShowStashDialog] = useState(false);
	const [stashRefreshKey, setStashRefreshKey] = useState(0);
	const [loading, setLoading] = useState(true);
	const [projectLoading, setProjectLoading] = useState(false);
	const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
	const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
	const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
	const [settingsTabOverride, setSettingsTabOverride] = useState<SettingsTab | null>(null);
	const [isWorktreePanelCollapsed, setIsWorktreePanelCollapsed] = useState(
		() => !appSettings.showWorktreePanel
	);
	const rightPanelRef = useRef<PanelImperativeHandle>(null);
	const leftPanelRef = useRef<PanelImperativeHandle>(null);

	const { status, currentBranchInfo, remotes, activeWorktreePath, cachedLog } = repoState;

	const mainLayout = useDefaultLayout({
		id: "gitagen-main-layout-v4",
		storage: typeof localStorage !== "undefined" ? localStorage : undefined,
	});
	const contentLayout = useDefaultLayout({
		id: "gitagen-content-layout-v4",
		storage: typeof localStorage !== "undefined" ? localStorage : undefined,
	});
	const sanitizedMainLayout = useMemo(
		() =>
			sanitizeTwoPanelLayout(mainLayout.defaultLayout, {
				fallback: MAIN_LAYOUT_FALLBACK,
				firstMin: 12,
				firstMax: 35,
				secondMin: 65,
				secondMax: 88,
				allowFirstCollapse: true,
				panelIds: ["sidebar", "main"],
			}),
		[mainLayout.defaultLayout]
	);
	const sanitizedContentLayout = useMemo(
		() =>
			sanitizeTwoPanelLayout(contentLayout.defaultLayout, {
				fallback: CONTENT_LAYOUT_FALLBACK,
				firstMin: 30,
				firstMax: 100,
				secondMin: 15,
				secondMax: 45,
				allowSecondCollapse: true,
				panelIds: ["center", "right"],
			}),
		[contentLayout.defaultLayout]
	);
	const toggleRightPanel = useCallback(() => {
		const panel = rightPanelRef.current;
		if (panel?.isCollapsed()) {
			panel.expand();
			setIsRightPanelCollapsed(false);
		} else {
			panel?.collapse();
			setIsRightPanelCollapsed(true);
		}
	}, []);

	const toggleLeftPanel = useCallback(() => {
		const panel = leftPanelRef.current;
		if (panel?.isCollapsed()) {
			panel.expand();
			setIsLeftPanelCollapsed(false);
		} else {
			panel?.collapse();
			setIsLeftPanelCollapsed(true);
		}
	}, []);

	const toggleWorktreePanel = useCallback(() => {
		setIsWorktreePanelCollapsed((prev) => !prev);
	}, []);

	const handleViewAll = useCallback(() => {
		setViewMode("all");
	}, []);

	const handleSelectFile = useCallback((file: GitFileStatus) => {
		setSelectedFile(file);
		setSelectedCommitOid(null);
	}, []);

	const openGitAgent = useCallback((initialPrompt?: string) => {
		setGitAgentInitialPrompt(initialPrompt);
		setShowGitAgent(true);
	}, []);

	const refreshStatus = useCallback(() => {
		if (!activeProject) return;
		window.gitagen.repo.getStatus(activeProject.id).then((status) => {
			if (status) dispatch({ type: "SET_STATUS", payload: status });
		});
	}, [activeProject?.id]);
	const refreshStatusAndPrefs = refreshStatus;

	useEffect(() => {
		window.gitagen.projects.list().then((list: Project[]) => {
			setProjects(list);
			setLoading(false);
			const lastId =
				typeof localStorage !== "undefined" ? localStorage.getItem(LAST_PROJECT_KEY) : null;
			if (lastId && list.some((p) => p.id === lastId)) {
				const project = list.find((p) => p.id === lastId) ?? null;
				if (project) setActiveProject(project);
			}
		});
	}, []);

	useEffect(() => {
		if (activeProject) {
			try {
				localStorage.setItem(LAST_PROJECT_KEY, activeProject.id);
			} catch {
				// ignore localStorage quota / privacy errors
			}
		}
	}, [activeProject?.id]);

	useEffect(() => {
		dispatch({ type: "CLEAR_REPO_STATE" });
		setSelectedFile(null);
		setSelectedCommitOid(null);
		if (!activeProject) {
			setProjectLoading(false);
			return;
		}
		setProjectLoading(true);
		const currentId = activeProject.id;
		window.gitagen.repo
			.openProject(currentId)
			.then((data) => {
				if (!data) return;
				dispatch({ type: "SET_STATUS", payload: data.status });
				dispatch({
					type: "SET_WORKTREE_PATH",
					payload: data.prefs?.activeWorktreePath ?? null,
				});
				dispatch({
					type: "SET_BRANCH_INFO",
					payload: data.branches.find((b) => b.current) ?? null,
				});
				dispatch({ type: "SET_REMOTES", payload: data.remotes });
				if (data.cachedLog && data.cachedLog.length > 0) {
					dispatch({
						type: "SET_CACHED_LOG",
						payload: {
							projectId: currentId,
							commits: data.cachedLog,
							unpushedOids: data.cachedUnpushedOids,
						},
					});
				}
			})
			.catch((error) => {
				console.error("[App] openProject failed:", error);
			})
			.finally(() => {
				setProjectLoading(false);
			});
	}, [activeProject?.id]);

	useEffect(() => {
		if (!activeProject) return;

		const startWatching = () => {
			window.gitagen.repo.watchProject(activeProject.id);
		};

		const stopWatching = () => {
			window.gitagen.repo.unwatchProject(activeProject.id);
		};

		const handleFocus = () => {
			refreshStatus();
			startWatching();
		};

		const handleBlur = () => {
			stopWatching();
		};

		if (document.hasFocus()) {
			startWatching();
		}

		window.addEventListener("focus", handleFocus);
		window.addEventListener("blur", handleBlur);

		return () => {
			stopWatching();
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("blur", handleBlur);
		};
	}, [activeProject?.id, refreshStatus]);

	useEffect(() => {
		if (!selectedFile || !status) return;
		const lookup = (
			items: RepoStatus["staged"] | RepoStatus["unstaged"] | RepoStatus["untracked"],
			type: "staged" | "unstaged" | "untracked"
		) => {
			for (const item of items) {
				const path = typeof item === "string" ? item : item.path;
				if (path === selectedFile.path) return type;
			}
			return null;
		};
		const newStatus =
			lookup(status.staged, "staged") ??
			lookup(status.unstaged, "unstaged") ??
			lookup(status.untracked, "untracked");
		if (newStatus && newStatus !== selectedFile.status) {
			setSelectedFile((prev) => (prev ? { ...prev, status: newStatus } : prev));
		}
	}, [status, selectedFile?.path]);

	useEffect(() => {
		const unsubscribeUpdated = window.gitagen.events.onRepoUpdated(
			(payload: { projectId: string; updatedAt: number }) => {
				if (!activeProject || payload.projectId !== activeProject.id) return;
				refreshStatus();
			}
		);
		const unsubscribeConflicts = window.gitagen.events.onConflictDetected(
			(payload: { projectId: string; state: ConflictState }) => {
				if (!activeProject || payload.projectId !== activeProject.id) return;
				refreshStatus();
			}
		);
		const unsubscribeErrors = window.gitagen.events.onRepoError(
			(payload: { projectId: string | null; message: string; name: string }) => {
				if (!activeProject) return;
				if (payload.projectId && payload.projectId !== activeProject.id) return;
				toast.error(payload.name, payload.message);
			}
		);
		return () => {
			unsubscribeUpdated();
			unsubscribeConflicts();
			unsubscribeErrors();
		};
	}, [activeProject?.id, refreshStatus, toast]);

	const handleAddProject = async () => {
		const path: string | null = await window.gitagen.settings.selectFolder();
		if (!path) return;
		const name = path.split("/").filter(Boolean).pop() || "repo";
		const p = await window.gitagen.projects.add(name, path);
		setProjects((prev) => [p, ...prev]);
		setActiveProject(p);
	};

	const handleRemoveProject = useCallback(
		async (projectId: string) => {
			await window.gitagen.projects.remove(projectId);
			setProjects((prev) => prev.filter((p) => p.id !== projectId));
			if (activeProject?.id === projectId) {
				setActiveProject(null);
			}
		},
		[activeProject?.id]
	);

	const gitStatus: GitStatus | null =
		activeProject && status
			? {
					repoPath: activeProject.path,
					staged: repoStatusToGitFileStatus(status, "staged"),
					unstaged: repoStatusToGitFileStatus(status, "unstaged"),
					untracked: repoStatusToGitFileStatus(status, "untracked"),
				}
			: null;

	const appRoute = getAppRouteId({
		loading,
		projects,
		activeProject,
		gitStatus,
		showSettings,
		selectedCommitOid,
	});

	const closeCommandPalette = useCallback(() => {
		setIsCommandPaletteOpen(false);
	}, []);

	const commandContext = useMemo<CommandContext>(
		() => ({
			route: appRoute,
			projects,
			activeProject,
			status,
			gitStatus,
			activeWorktreePath,
			selectedFile,
			diffStyle,
			viewMode,
			rightTab,
			selectedCommitOid,
			isLeftPanelCollapsed,
			isRightPanelCollapsed,
		}),
		[
			activeProject,
			activeWorktreePath,
			appRoute,
			diffStyle,
			gitStatus,
			isLeftPanelCollapsed,
			isRightPanelCollapsed,
			projects,
			rightTab,
			selectedCommitOid,
			selectedFile,
			status,
			viewMode,
		]
	);

	const commandActions = useMemo<CommandActions>(
		() => ({
			onOpenProject: (project) => {
				setActiveProject(project);
				setShowSettings(false);
				setSelectedCommitOid(null);
			},
			onAddProject: handleAddProject,
			onBackToProjects: () => {
				setShowSettings(false);
				setSelectedCommitOid(null);
				setActiveProject(null);
			},
			onOpenGitAgent: () => {
				openGitAgent();
			},
			onOpenSettings: (tab) => {
				setSettingsTabOverride(tab ?? null);
				setShowSettings(true);
				setSelectedCommitOid(null);
			},
			onCloseSettings: () => {
				setShowSettings(false);
				setSettingsTabOverride(null);
			},
			onSetViewMode: setViewMode,
			onSetDiffStyle: setDiffStyle,
			onSetRightTab: setRightTab,
			onToggleLeftPanel: toggleLeftPanel,
			onToggleRightPanel: toggleRightPanel,
			onRefreshStatus: refreshStatus,
			onRefreshStatusAndPrefs: refreshStatusAndPrefs,
			onSelectFile: handleSelectFile,
			onOpenCommitDetail: (oid) => {
				setSelectedCommitOid(oid);
			},
			onCloseCommitDetail: () => {
				setSelectedCommitOid(null);
			},
			onNotifyError: (message) => {
				toast.error(message);
			},
		}),
		[
			handleAddProject,
			handleSelectFile,
			openGitAgent,
			refreshStatus,
			refreshStatusAndPrefs,
			toggleLeftPanel,
			toggleRightPanel,
			toast,
		]
	);

	const commands = useCommandRegistry(commandContext, commandActions);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			if (event.key.toLowerCase() !== "p") return;
			if (appRoute === "loading") return;
			event.preventDefault();
			setIsCommandPaletteOpen((prev) => !prev);
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [appRoute]);

	useEffect(() => {
		if (appRoute === "loading") {
			setIsCommandPaletteOpen(false);
		}
	}, [appRoute]);

	const withPalette = (content: ReactNode) => (
		<>
			{content}
			{appRoute !== "loading" && (
				<CommandPalette
					open={isCommandPaletteOpen}
					onClose={closeCommandPalette}
					commands={commands}
				/>
			)}
			{activeProject && (
				<GitAgentModal
					open={showGitAgent}
					onClose={() => {
						setShowGitAgent(false);
						setGitAgentInitialPrompt(undefined);
						refreshStatus();
					}}
					projectId={activeProject.id}
					initialPrompt={gitAgentInitialPrompt}
				/>
			)}
			{activeProject && (
				<StashDialog
					open={showStashDialog}
					onClose={() => setShowStashDialog(false)}
					projectId={activeProject.id}
					onStashCreated={() => {
						refreshStatus();
						setStashRefreshKey((k) => k + 1);
					}}
				/>
			)}
		</>
	);

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-(--bg-primary)">
				<div className="text-sm text-(--text-muted)">Loading...</div>
			</div>
		);
	}

	if (projects.length === 0) {
		return withPalette(
			<div className="empty-state h-screen bg-(--bg-primary)">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--bg-secondary) border border-(--border-secondary)">
					<FolderOpen size={32} className="text-(--text-muted)" />
				</div>
				<div className="text-center">
					<p className="text-lg font-semibold text-(--text-primary)">No projects yet</p>
					<p className="mt-2 text-sm text-(--text-muted) max-w-sm">
						Add a git repository to get started with Gitagen
					</p>
				</div>
				<button type="button" onClick={handleAddProject} className="btn btn-primary">
					<Plus size={16} />
					Add repository
				</button>
			</div>
		);
	}

	if (!activeProject) {
		return withPalette(
			<StartPage
				projects={projects}
				onSelectProject={setActiveProject}
				onAddProject={handleAddProject}
				onRemoveProject={handleRemoveProject}
			/>
		);
	}

	if (showSettings) {
		return withPalette(
			<div className="flex h-screen flex-col bg-(--bg-primary) animate-fade-in">
				<SettingsPanel
					projectId={activeProject.id}
					activeTabOverride={settingsTabOverride}
					onClose={() => {
						setShowSettings(false);
						setSettingsTabOverride(null);
					}}
				/>
			</div>
		);
	}

	if (!gitStatus) {
		return withPalette(
			<div className="flex h-screen flex-col items-center justify-center gap-4 bg-(--bg-primary)">
				{projectLoading ? (
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				) : (
					<>
						<p className="text-sm text-(--text-muted)">
							Not a git repository or failed to load status.
						</p>
						<button
							type="button"
							onClick={() => setActiveProject(null)}
							className="text-sm text-(--accent-primary) hover:underline"
						>
							Back to projects
						</button>
					</>
				)}
			</div>
		);
	}

	return withPalette(
		<div className="flex h-screen flex-col bg-(--bg-primary)">
			<ConflictBanner projectId={activeProject.id} onResolved={refreshStatus} />
			<Group
				className="flex flex-1 min-h-0"
				id="main-layout"
				orientation="horizontal"
				defaultLayout={sanitizedMainLayout}
				onLayoutChanged={mainLayout.onLayoutChanged}
			>
				<Panel
					id="sidebar"
					className="flex flex-col border-r border-(--border-secondary)"
					collapsible
					defaultSize="20%"
					minSize="14%"
					maxSize="35%"
					panelRef={leftPanelRef}
					onResize={(size) => {
						setIsLeftPanelCollapsed(size.asPercentage < 1);
					}}
				>
					<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
						<Sidebar
							projectId={activeProject.id}
							status={gitStatus}
							selectedFile={selectedFile}
							onSelectFile={handleSelectFile}
							onRefresh={refreshStatus}
							onBack={() => setActiveProject(null)}
							projects={projects}
							activeProject={activeProject}
							onProjectChange={setActiveProject}
							onAddProject={handleAddProject}
							onViewAll={handleViewAll}
						/>
					</div>
					{isWorktreePanelCollapsed ? (
						<button
							type="button"
							onClick={toggleWorktreePanel}
							className="flex shrink-0 items-center gap-2 border-t border-(--border-secondary) px-3 py-2 text-left text-[11px] font-medium text-(--text-muted) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-secondary)"
							title="Show worktrees"
						>
							<FolderTree size={13} />
							<span>Worktrees</span>
							<ChevronRight size={11} className="ml-auto" />
						</button>
					) : (
						<WorktreePanel
							projectId={activeProject.id}
							projectName={activeProject.name}
							projectPath={activeProject.path}
							currentBranch={status?.branch ?? ""}
							activeWorktreePath={activeWorktreePath}
							onRefresh={refreshStatus}
							isCollapsed={isWorktreePanelCollapsed}
							onToggle={toggleWorktreePanel}
						/>
					)}
				</Panel>
				<Separator className="panel-resize-handle" />
				<Panel id="main" className="flex min-w-0 flex-1 flex-col" minSize="40%">
					<div className="flex shrink-0 items-center gap-1.5 border-b border-(--border-secondary) bg-(--bg-toolbar) px-3 py-1.5">
						<div className="flex min-w-0 items-center gap-1">
							<button
								type="button"
								onClick={toggleLeftPanel}
								className="btn-icon rounded-md p-1.5"
								title={isLeftPanelCollapsed ? "Show panel" : "Hide panel"}
								aria-label={
									isLeftPanelCollapsed
										? "Show sidebar panel"
										: "Hide sidebar panel"
								}
							>
								{isLeftPanelCollapsed ? (
									<PanelLeft size={15} />
								) : (
									<PanelLeftClose size={15} />
								)}
							</button>
							<div className="mx-0.5 hidden h-4 w-px bg-(--border-secondary) sm:block" />
							<WorktreeSelector
								projectId={activeProject.id}
								activeWorktreePath={activeWorktreePath}
								mainRepoPath={activeProject.path}
								onWorktreeChange={refreshStatus}
							/>
							<div className="mx-0.5 h-4 w-px bg-(--border-secondary)" />
							<BranchSelector
								projectId={activeProject.id}
								currentBranch={status?.branch ?? ""}
								onBranchChange={refreshStatus}
							/>
							{remotes.length > 0 && (
								<button
									type="button"
									onClick={() => {
										const remote = parseRemoteForLinks(remotes[0].url);
										if (remote) {
											const branch = status?.branch || "main";
											const url =
												remote.host === "github"
													? `https://github.com/${remote.owner}/${remote.repo}/tree/${branch}`
													: `https://gitlab.com/${remote.owner}/${remote.repo}/-/tree/${branch}`;
											window.gitagen.app.openExternal(url);
										} else {
											window.gitagen.app.openExternal(remotes[0].url);
										}
									}}
									className="btn-icon rounded-md p-1.5"
									data-tooltip="Open remote repository"
									data-tooltip-position="bottom"
									aria-label="Open remote repository"
								>
									<Link size={14} />
								</button>
							)}
						</div>
						<div className="mx-1 hidden h-4 w-px bg-(--border-secondary) sm:block" />
						<div
							className="hidden items-center tab-bar sm:flex"
							role="tablist"
							aria-label="View mode"
						>
							<button
								type="button"
								onClick={() => setViewMode("single")}
								title="Single file view"
								className="tab-item"
								role="tab"
								aria-selected={viewMode === "single"}
							>
								<FileText size={14} />
							</button>
							<button
								type="button"
								onClick={() => setViewMode("all")}
								title="All changes view"
								className="tab-item"
								role="tab"
								aria-selected={viewMode === "all"}
							>
								<FileStack size={14} />
							</button>
						</div>
						<div
							className="hidden items-center tab-bar md:flex"
							role="tablist"
							aria-label="Diff style"
						>
							<button
								type="button"
								onClick={() => setDiffStyle("unified")}
								title="Unified diff"
								className="tab-item"
								role="tab"
								aria-selected={diffStyle === "unified"}
							>
								<Rows3 size={14} />
							</button>
							<button
								type="button"
								onClick={() => setDiffStyle("split")}
								title="Split diff"
								className="tab-item"
								role="tab"
								aria-selected={diffStyle === "split"}
							>
								<Columns size={14} />
							</button>
						</div>
						<div className="ml-auto flex shrink-0 items-center gap-0.5">
							<button
								type="button"
								onClick={() => openGitAgent()}
								className="btn-icon rounded-md p-1.5"
								title="Open GitAgent"
								aria-label="Open GitAgent"
							>
								<Sparkles size={15} />
							</button>
							<SyncButtons
								projectId={activeProject.id}
								ahead={currentBranchInfo?.ahead ?? 0}
								behind={currentBranchInfo?.behind ?? 0}
								hasRemotes={remotes.length > 0}
								onComplete={refreshStatus}
							/>
							<div className="mx-0.5 h-4 w-px bg-(--border-secondary)" />
							<button
								type="button"
								onClick={toggleRightPanel}
								className="btn-icon rounded-md p-1.5"
								title={isRightPanelCollapsed ? "Show panel" : "Hide panel"}
								aria-label={
									isRightPanelCollapsed ? "Show right panel" : "Hide right panel"
								}
							>
								{isRightPanelCollapsed ? (
									<PanelRight size={15} />
								) : (
									<PanelRightClose size={15} />
								)}
							</button>
							<button
								type="button"
								onClick={() => {
									setSettingsTabOverride(null);
									setShowSettings(true);
								}}
								className="btn-icon rounded-md p-1.5"
								title="Settings"
								aria-label="Open settings"
							>
								<Settings size={15} />
							</button>
						</div>
					</div>
					<Group
						className="flex min-h-0 flex-1"
						id="content-layout"
						orientation="horizontal"
						defaultLayout={sanitizedContentLayout}
						onLayoutChanged={contentLayout.onLayoutChanged}
					>
						<Panel id="center" className="flex min-w-0 flex-1 flex-col" minSize="30%">
							{selectedCommitOid ? (
								<CommitDetailView
									projectId={activeProject.id}
									oid={selectedCommitOid}
									diffStyle={diffStyle}
									onClose={() => setSelectedCommitOid(null)}
								/>
							) : selectedStashIndex !== null ? (
								<StashDetailView
									projectId={activeProject.id}
									index={selectedStashIndex}
									diffStyle={diffStyle}
									onClose={() => setSelectedStashIndex(null)}
									onActionComplete={() => {
										refreshStatus();
										setStashRefreshKey((k) => k + 1);
									}}
								/>
							) : (
								<Group
									className="flex min-h-0 flex-1 flex-col"
									id="center-vertical"
									orientation="vertical"
									defaultLayout={{ "diff-area": 75, "commit-area": 25 }}
								>
									<Panel
										id="diff-area"
										className="flex min-h-0 flex-1 flex-col"
										minSize="30%"
									>
										{viewMode === "all" ? (
											<AllChangesView
												projectId={activeProject.id}
												gitStatus={gitStatus}
												diffStyle={diffStyle}
												selectedFile={selectedFile}
												onRefresh={refreshStatus}
											/>
										) : (
											<DiffViewer
												projectId={activeProject.id}
												repoPath={gitStatus.repoPath}
												selectedFile={selectedFile}
												diffStyle={diffStyle}
												onRefresh={refreshStatus}
											/>
										)}
									</Panel>
									<Separator className="panel-resize-handle" />
									<Panel
										id="commit-area"
										className="flex flex-col border-t border-(--border-primary)"
										minSize="10%"
										defaultSize="25%"
									>
										<CommitPanel
											projectId={activeProject.id}
											onCommit={refreshStatus}
											onOpenGitAgent={() =>
												openGitAgent(COMMIT_AGENT_INITIAL_PROMPT)
											}
										/>
									</Panel>
								</Group>
							)}
						</Panel>
						<Separator className="panel-resize-handle" />
						<Panel
							id="right"
							className="hidden flex-col border-l border-(--border-secondary) md:flex"
							collapsible
							defaultSize="30%"
							minSize="15%"
							maxSize="45%"
							panelRef={rightPanelRef}
							onResize={(size) => {
								setIsRightPanelCollapsed(size.asPercentage < 1);
							}}
						>
							<div className="flex min-h-0 flex-1 flex-col">
								<div
									className="flex shrink-0 tab-bar border-b border-(--border-secondary) mx-2 mt-2"
									role="tablist"
									aria-label="Right panel tabs"
								>
									<button
										type="button"
										onClick={() => setRightTab("log")}
										className="tab-item flex-1"
										role="tab"
										aria-selected={rightTab === "log"}
									>
										<History size={13} />
										<span className="hidden lg:inline text-[11px]">Log</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("stash")}
										className="tab-item flex-1"
										role="tab"
										aria-selected={rightTab === "stash"}
									>
										<Archive size={13} />
										<span className="hidden lg:inline text-[11px]">Stash</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("remote")}
										className="tab-item flex-1"
										role="tab"
										aria-selected={rightTab === "remote"}
									>
										<Cloud size={13} />
										<span className="hidden lg:inline text-[11px]">Remote</span>
									</button>
								</div>
								<div className="relative min-h-0 flex-1 overflow-hidden">
									<div
										className={`h-full overflow-auto ${rightTab !== "log" ? "hidden" : ""}`}
										aria-hidden={rightTab !== "log"}
									>
										<LogPanel
											projectId={activeProject.id}
											selectedOid={selectedCommitOid}
											onSelectCommit={setSelectedCommitOid}
											initialCommits={
												cachedLog?.projectId === activeProject.id
													? cachedLog.commits
													: null
											}
											initialUnpushedOids={
												cachedLog?.projectId === activeProject.id
													? (cachedLog.unpushedOids ?? null)
													: null
											}
											hasRemotes={remotes.length > 0}
										/>
									</div>
									<div
										className={`h-full overflow-auto ${rightTab !== "stash" ? "hidden" : ""}`}
										aria-hidden={rightTab !== "stash"}
									>
										<StashPanel
											projectId={activeProject.id}
											onRefresh={refreshStatus}
											selectedIndex={selectedStashIndex}
											onSelect={setSelectedStashIndex}
											onOpenCreateDialog={() => setShowStashDialog(true)}
											refreshKey={stashRefreshKey}
										/>
									</div>
									<div
										className={`h-full overflow-auto ${rightTab !== "remote" ? "hidden" : ""}`}
										aria-hidden={rightTab !== "remote"}
									>
										<RemotePanel
											projectId={activeProject.id}
											onRefresh={refreshStatus}
										/>
									</div>
								</div>
							</div>
						</Panel>
					</Group>
				</Panel>
			</Group>
		</div>
	);
}

const COMMIT_STYLES: { value: CommitStyle; label: string }[] = [
	{ value: "conventional", label: "Conventional (feat:, fix:)" },
	{ value: "emoji", label: "Emoji (Gitmoji)" },
	{ value: "descriptive", label: "Descriptive" },
	{ value: "imperative", label: "Imperative" },
];

function AISettingsSection() {
	const [providers, setProviders] = useState<AIProviderInstance[]>([]);
	const [providerTypes, setProviderTypes] = useState<AIProviderDescriptor[]>([]);
	const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
	const [commitStyle, setCommitStyle] = useState<CommitStyle>("conventional");
	const [editingProvider, setEditingProvider] = useState<AIProviderInstance | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [newProviderType, setNewProviderType] = useState<AIProviderType>("openai");
	const [newProviderName, setNewProviderName] = useState("");
	const [newProviderApiKey, setNewProviderApiKey] = useState("");
	const [newProviderBaseURL, setNewProviderBaseURL] = useState("");
	const [newProviderModels, setNewProviderModels] = useState<string[]>([]);
	const [newProviderModelSearch, setNewProviderModelSearch] = useState("");
	const [newProviderCustomModelInput, setNewProviderCustomModelInput] = useState("");
	const [newProviderDefaultModel, setNewProviderDefaultModel] = useState("");
	const [loadingModels, setLoadingModels] = useState(false);
	const [modelError, setModelError] = useState<string | null>(null);

	const providerById = useMemo(() => {
		const entries = providerTypes.map(
			(provider: AIProviderDescriptor) => [provider.id, provider] as const
		);
		return Object.fromEntries(entries);
	}, [providerTypes]);

	const selectedProviderType = providerById[newProviderType];
	const requiresBaseURL = selectedProviderType?.requiresBaseURL ?? false;

	const filteredNewProviderModels = useMemo(() => {
		const query = newProviderModelSearch.trim().toLowerCase();
		if (!query) return newProviderModels;
		return newProviderModels.filter((model) => model.toLowerCase().includes(query));
	}, [newProviderModelSearch, newProviderModels]);

	const loadProviderTypes = useCallback(async () => {
		const list = await window.gitagen.settings.listAIProviders();
		setProviderTypes(list);
		if (list.length > 0) {
			setNewProviderType((current) => {
				if (list.some((provider) => provider.id === current)) {
					return current;
				}
				return list[0]!.id;
			});
		}
	}, []);

	const loadProviders = useCallback(async () => {
		const settings = await window.gitagen.settings.getGlobalWithKeys();
		setProviders(settings.ai.providers);
		setActiveProviderId(settings.ai.activeProviderId);
		setCommitStyle(settings.ai.commitStyle);
	}, []);

	useEffect(() => {
		void loadProviders();
		void loadProviderTypes();
	}, [loadProviderTypes, loadProviders]);

	const handleFetchNewProviderModels = useCallback(
		async (opts?: { silent?: boolean }) => {
			if (!newProviderApiKey.trim()) {
				if (!opts?.silent) {
					setModelError("Enter an API key first");
				}
				return;
			}
			if (requiresBaseURL && !newProviderBaseURL.trim()) {
				if (!opts?.silent) {
					setModelError("Base URL is required for this provider");
				}
				return;
			}
			setLoadingModels(true);
			setModelError(null);
			const result = await window.gitagen.settings.fetchModels(
				newProviderType,
				newProviderApiKey,
				newProviderBaseURL || undefined
			);
			setLoadingModels(false);
			if (result.success) {
				setNewProviderModels(result.models);
				if (result.models.length > 0) {
					setNewProviderDefaultModel((current) => {
						if (current && result.models.includes(current)) {
							return current;
						}
						return result.models[0];
					});
				}
			} else if (!opts?.silent) {
				setModelError(result.error || "Failed to fetch models");
			}
		},
		[newProviderApiKey, newProviderBaseURL, newProviderType, requiresBaseURL]
	);

	const handleAddCustomModel = () => {
		const custom = newProviderCustomModelInput.trim();
		if (!custom || newProviderModels.includes(custom)) return;
		setNewProviderModels((prev) => [...prev, custom]);
		setNewProviderDefaultModel(custom);
		setNewProviderCustomModelInput("");
	};

	const resetAddForm = () => {
		setNewProviderType(providerTypes[0]?.id ?? "openai");
		setNewProviderName("");
		setNewProviderApiKey("");
		setNewProviderBaseURL("");
		setNewProviderModels([]);
		setNewProviderModelSearch("");
		setNewProviderCustomModelInput("");
		setNewProviderDefaultModel("");
		setLoadingModels(false);
		setModelError(null);
	};

	const handleAddProvider = async () => {
		if (!newProviderApiKey.trim()) {
			setModelError("API key is required");
			return;
		}
		if (requiresBaseURL && !newProviderBaseURL.trim()) {
			setModelError("Base URL is required for this provider");
			return;
		}
		const id = `${newProviderType}-${Date.now()}`;
		const defaultModel = newProviderDefaultModel.trim();
		const modelList = Array.from(
			new Set(newProviderModels.map((model) => model.trim()))
		).filter((model) => model.length > 0);
		if (defaultModel && !modelList.includes(defaultModel)) {
			modelList.push(defaultModel);
		}
		const newProvider: AIProviderInstance = {
			id,
			name:
				newProviderName ||
				`${selectedProviderType?.displayName ?? newProviderType} Provider`,
			type: newProviderType,
			enabled: true,
			apiKey: newProviderApiKey,
			baseURL: newProviderBaseURL || undefined,
			defaultModel,
			models: modelList,
		};
		await window.gitagen.settings.setGlobal({
			ai: {
				providers: [...providers, newProvider],
				activeProviderId: activeProviderId || id,
				commitStyle,
			},
		});
		setShowAddForm(false);
		resetAddForm();
		void loadProviders();
	};

	const handleUpdateProvider = async (updated: AIProviderInstance) => {
		const updatedProviders = providers.map((p) => (p.id === updated.id ? updated : p));
		await window.gitagen.settings.setGlobal({
			ai: {
				providers: updatedProviders,
				activeProviderId,
				commitStyle,
			},
		});
		setEditingProvider(null);
		void loadProviders();
	};

	const handleDeleteProvider = async (id: string) => {
		const updatedProviders = providers.filter((p) => p.id !== id);
		const newActiveId =
			activeProviderId === id ? (updatedProviders[0]?.id ?? null) : activeProviderId;
		await window.gitagen.settings.setGlobal({
			ai: {
				providers: updatedProviders,
				activeProviderId: newActiveId,
				commitStyle,
			},
		});
		void loadProviders();
	};

	const handleSetActive = async (id: string) => {
		await window.gitagen.settings.setGlobal({
			ai: { providers, activeProviderId: id, commitStyle },
		});
		setActiveProviderId(id);
	};

	return (
		<div className="rounded-lg border border-(--border-primary) p-3">
			<div className="mb-3 flex items-center justify-between">
				<p className="text-xs font-medium text-(--text-secondary)">AI Providers</p>
				<button
					type="button"
					onClick={() => setShowAddForm(true)}
					className="btn btn-secondary text-xs"
				>
					+ Add
				</button>
			</div>
			<div className="mb-3 flex items-center gap-2">
				<p className="text-xs font-medium text-(--text-secondary) shrink-0">Commit style</p>
				<select
					value={commitStyle}
					onChange={async (e) => {
						const v = (e.target as HTMLSelectElement).value as CommitStyle;
						setCommitStyle(v);
						await window.gitagen.settings.setGlobal({
							ai: { providers, activeProviderId, commitStyle: v },
						});
					}}
					className="input flex-1 text-xs"
				>
					{COMMIT_STYLES.map((s) => (
						<option key={s.value} value={s.value}>
							{s.label}
						</option>
					))}
				</select>
			</div>

			<Dialog
				open={showAddForm}
				onOpenChange={(nextOpen) => {
					setShowAddForm(nextOpen);
					if (!nextOpen) {
						setModelError(null);
					}
				}}
			>
				<DialogContent size="lg" className="p-0">
					<ModalShell title="Add AI provider" bodyClassName="space-y-3">
						{providerTypes.length === 0 ? (
							<p className="text-sm text-(--danger)">
								No provider types are available.
							</p>
						) : (
							<>
								<select
									value={newProviderType}
									onChange={(e) => {
										setNewProviderType(
											(e.target as HTMLSelectElement).value as AIProviderType
										);
										setNewProviderModels([]);
										setNewProviderModelSearch("");
										setNewProviderCustomModelInput("");
										setNewProviderDefaultModel("");
										setModelError(null);
									}}
									className="input w-full text-xs"
								>
									{providerTypes.map((providerType) => (
										<option key={providerType.id} value={providerType.id}>
											{providerType.displayName}
										</option>
									))}
								</select>
								<input
									value={newProviderName}
									onChange={(e) =>
										setNewProviderName((e.target as HTMLInputElement).value)
									}
									placeholder="Provider name (optional)"
									className="input w-full text-xs"
								/>
								{requiresBaseURL && (
									<input
										value={newProviderBaseURL}
										onChange={(e) =>
											setNewProviderBaseURL(
												(e.target as HTMLInputElement).value
											)
										}
										placeholder="Base URL (e.g. https://api.example.com/v1)"
										className="input w-full text-xs"
									/>
								)}
								<div className="flex gap-2">
									<input
										value={newProviderApiKey}
										onChange={(e) =>
											setNewProviderApiKey(
												(e.target as HTMLInputElement).value
											)
										}
										placeholder="API Key"
										type="password"
										className="input flex-1 text-xs"
									/>
									<button
										type="button"
										onClick={() => void handleFetchNewProviderModels()}
										disabled={loadingModels}
										className="btn btn-secondary text-xs whitespace-nowrap"
									>
										{loadingModels ? "..." : "Fetch Models"}
									</button>
								</div>
								{modelError && (
									<p className="text-xs text-(--danger)">{modelError}</p>
								)}
								<input
									value={newProviderModelSearch}
									onChange={(e) =>
										setNewProviderModelSearch(
											(e.target as HTMLInputElement).value
										)
									}
									placeholder="Search models"
									className="input w-full text-xs"
								/>
								<select
									value={newProviderDefaultModel}
									onChange={(e) =>
										setNewProviderDefaultModel(
											(e.target as HTMLSelectElement).value
										)
									}
									className="input w-full text-xs"
								>
									<option value="">
										{newProviderModels.length
											? filteredNewProviderModels.length
												? "Select model"
												: "No models match search"
											: "Fetch or add a model manually"}
									</option>
									{filteredNewProviderModels.map((model) => (
										<option key={model} value={model}>
											{model}
										</option>
									))}
								</select>
								<div className="flex gap-2">
									<input
										value={newProviderCustomModelInput}
										onChange={(e) =>
											setNewProviderCustomModelInput(
												(e.target as HTMLInputElement).value
											)
										}
										onKeyDown={(e) =>
											e.key === "Enter" && handleAddCustomModel()
										}
										placeholder="Custom model ID"
										className="input flex-1 text-xs"
									/>
									<button
										type="button"
										onClick={handleAddCustomModel}
										disabled={!newProviderCustomModelInput.trim()}
										className="btn btn-secondary text-xs"
									>
										Add Model
									</button>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => void handleAddProvider()}
										className="btn btn-primary text-xs"
									>
										Add
									</button>
									<button
										type="button"
										onClick={() => {
											setShowAddForm(false);
											resetAddForm();
										}}
										className="btn btn-secondary text-xs"
									>
										Cancel
									</button>
								</div>
							</>
						)}
					</ModalShell>
				</DialogContent>
			</Dialog>

			{providers.length === 0 ? (
				<p className="text-xs text-(--text-muted)">No AI providers configured.</p>
			) : (
				<div className="space-y-2">
					{providers.map((provider) => (
						<div
							key={provider.id}
							className={`rounded-lg border p-2 ${
								activeProviderId === provider.id
									? "border-(--border-primary) bg-(--bg-active)"
									: "border-(--border-primary)"
							}`}
						>
							<div className="flex items-center justify-between">
								<div className="flex-1">
									<p className="text-xs font-medium text-(--text-primary)">
										{provider.name}
									</p>
									<p className="text-[10px] text-(--text-muted)">
										{providerById[provider.type]?.displayName ?? provider.type}
										{provider.baseURL && ` - ${provider.baseURL}`}
									</p>
								</div>
								<div className="flex gap-1">
									{activeProviderId !== provider.id && (
										<button
											type="button"
											onClick={() => handleSetActive(provider.id)}
											className="rounded px-1.5 py-0.5 text-[10px] text-(--text-muted) hover:bg-(--bg-secondary)"
										>
											Set Active
										</button>
									)}
									<button
										type="button"
										onClick={() => setEditingProvider(provider)}
										className="rounded px-1.5 py-0.5 text-[10px] text-(--text-muted) hover:bg-(--bg-secondary)"
									>
										Edit
									</button>
									<button
										type="button"
										onClick={() => handleDeleteProvider(provider.id)}
										className="rounded px-1.5 py-0.5 text-[10px] text-(--danger) hover:bg-(--bg-secondary)"
									>
										Delete
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={editingProvider !== null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setEditingProvider(null);
				}}
			>
				<DialogContent size="lg" className="p-0">
					{editingProvider ? (
						<ModalShell
							title={`Edit ${editingProvider.name}`}
							description="Update provider credentials, model list and defaults."
						>
							<ProviderEditForm
								provider={editingProvider}
								requiresBaseURL={
									providerById[editingProvider.type]?.requiresBaseURL ?? false
								}
								onSave={handleUpdateProvider}
								onCancel={() => setEditingProvider(null)}
							/>
						</ModalShell>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ProviderEditForm({
	provider,
	requiresBaseURL,
	onSave,
	onCancel,
}: {
	provider: AIProviderInstance;
	requiresBaseURL: boolean;
	onSave: (p: AIProviderInstance) => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState(provider.name);
	const [apiKey, setApiKey] = useState(provider.apiKey);
	const [baseURL, setBaseURL] = useState(provider.baseURL || "");
	const [defaultModel, setDefaultModel] = useState(provider.defaultModel);
	const [models, setModels] = useState<string[]>(provider.models);
	const [modelSearch, setModelSearch] = useState("");
	const [customModelInput, setCustomModelInput] = useState("");
	const [loadingModels, setLoadingModels] = useState(false);
	const [modelError, setModelError] = useState<string | null>(null);

	const filteredModels = useMemo(() => {
		const query = modelSearch.trim().toLowerCase();
		if (!query) return models;
		return models.filter((model) => model.toLowerCase().includes(query));
	}, [modelSearch, models]);

	const handleFetchModels = useCallback(
		async (opts?: { silent?: boolean }) => {
			if (!apiKey.trim()) {
				if (!opts?.silent) {
					setModelError("Enter an API key first");
				}
				return;
			}
			if (requiresBaseURL && !baseURL.trim()) {
				if (!opts?.silent) {
					setModelError("Base URL is required for this provider");
				}
				return;
			}
			setLoadingModels(true);
			setModelError(null);
			const result = await window.gitagen.settings.fetchModels(
				provider.type,
				apiKey,
				baseURL || undefined
			);
			setLoadingModels(false);
			if (result.success) {
				setModels(result.models);
				if (result.models.length > 0) {
					setDefaultModel((current) => {
						if (current && result.models.includes(current)) {
							return current;
						}
						return result.models[0];
					});
				}
			} else if (!opts?.silent) {
				setModelError(result.error || "Failed to fetch models");
			}
		},
		[apiKey, baseURL, provider.type, requiresBaseURL]
	);

	const handleAddCustomModel = () => {
		const custom = customModelInput.trim();
		if (custom && !models.includes(custom)) {
			setModels([...models, custom]);
			setDefaultModel(custom);
			setCustomModelInput("");
		}
	};

	const handleSave = () => {
		const trimmedDefaultModel = defaultModel.trim();
		const normalizedModels = Array.from(new Set(models.map((model) => model.trim()))).filter(
			(model) => model.length > 0
		);
		if (trimmedDefaultModel && !normalizedModels.includes(trimmedDefaultModel)) {
			normalizedModels.push(trimmedDefaultModel);
		}

		onSave({
			...provider,
			name,
			apiKey,
			baseURL: baseURL || undefined,
			defaultModel: trimmedDefaultModel,
			models: normalizedModels,
		});
	};

	return (
		<div className="space-y-2">
			<input
				value={name}
				onChange={(e) => setName((e.target as HTMLInputElement).value)}
				placeholder="Provider name"
				className="input w-full text-xs"
			/>
			<div className="flex gap-2">
				<input
					value={apiKey}
					onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
					placeholder="API Key"
					type="password"
					className="input flex-1 text-xs"
				/>
				<button
					type="button"
					onClick={() => void handleFetchModels()}
					disabled={loadingModels}
					className="btn btn-secondary text-xs whitespace-nowrap"
				>
					{loadingModels ? "Loading..." : "Fetch Models"}
				</button>
			</div>
			{modelError && <p className="text-xs text-(--danger)">{modelError}</p>}
			{requiresBaseURL && (
				<input
					value={baseURL}
					onChange={(e) => setBaseURL((e.target as HTMLInputElement).value)}
					placeholder="Base URL (e.g. https://api.example.com/v1)"
					className="input w-full text-xs"
				/>
			)}
			<input
				value={modelSearch}
				onChange={(e) => setModelSearch((e.target as HTMLInputElement).value)}
				placeholder="Search models"
				className="input w-full text-xs"
			/>
			<select
				value={defaultModel}
				onChange={(e) => setDefaultModel((e.target as HTMLSelectElement).value)}
				className="input w-full text-xs"
			>
				<option value="">
					{models.length
						? filteredModels.length
							? "Select model"
							: "No models match search"
						: "Fetch or add a model manually"}
				</option>
				{filteredModels.map((model) => (
					<option key={model} value={model}>
						{model}
					</option>
				))}
			</select>
			<div className="flex gap-2">
				<input
					value={customModelInput}
					onChange={(e) => setCustomModelInput((e.target as HTMLInputElement).value)}
					onKeyDown={(e) => e.key === "Enter" && handleAddCustomModel()}
					placeholder="Custom model ID"
					className="input flex-1 text-xs"
				/>
				<button
					type="button"
					onClick={handleAddCustomModel}
					disabled={!customModelInput.trim()}
					className="btn btn-secondary text-xs"
				>
					Add
				</button>
			</div>
			<div className="flex gap-2">
				<button onClick={handleSave} className="btn btn-primary text-xs">
					Save
				</button>
				<button onClick={onCancel} className="btn btn-secondary text-xs">
					Cancel
				</button>
			</div>
		</div>
	);
}

const FONT_PRESETS = ["geist", "geist-pixel", "system"] as const;
function isFontPreset(v: string): v is (typeof FONT_PRESETS)[number] {
	return FONT_PRESETS.includes(v as (typeof FONT_PRESETS)[number]);
}

function SettingsPanel({
	projectId,
	onClose,
	activeTabOverride,
}: {
	projectId: string | null;
	onClose: () => void;
	activeTabOverride?: SettingsTab | null;
}) {
	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const [gitPath, setGitPath] = useState<string | null>(null);
	const [gitBinaries, setGitBinaries] = useState<string[]>([]);
	const [signCommits, setSignCommits] = useState(false);
	const [signingKey, setSigningKey] = useState("");
	const [effectiveConfig, setEffectiveConfig] = useState<ConfigEntry[]>([]);
	const [localUserName, setLocalUserName] = useState("");
	const [localUserEmail, setLocalUserEmail] = useState("");
	const [localSignEnabled, setLocalSignEnabled] = useState(false);
	const [savingLocalConfig, setSavingLocalConfig] = useState(false);
	const [localConfigMessage, setLocalConfigMessage] = useState<string | null>(null);
	const [signingTestResult, setSigningTestResult] = useState<{
		ok: boolean;
		message: string;
	} | null>(null);
	const [sshAgentInfo, setSshAgentInfo] = useState<{
		name: string;
		path: string | null;
	}>({ name: "", path: null });
	const { theme, setTheme } = useTheme();
	const { updateSettings } = useSettings();
	const [uiScale, setUiScale] = useState(1.0);
	const [uiScaleText, setUiScaleText] = useState("100");
	const [fontSize, setFontSize] = useState(14);
	const [commitMessageFontSize, setCommitMessageFontSize] = useState(14);
	const [fontFamily, setFontFamily] = useState<FontFamily>("geist");
	const [customFontInput, setCustomFontInput] = useState("");
	const [gpuAcceleration, setGpuAcceleration] = useState(true);
	const [devMode, setDevMode] = useState(false);
	const [autoExpandSingleFolder, setAutoExpandSingleFolder] = useState(true);
	const [showWorktreePanel, setShowWorktreePanel] = useState(true);
	const signingConfigEntries = useMemo(() => {
		return {
			key: getLatestConfigEntry(effectiveConfig, "user.signingkey"),
			format: getLatestConfigEntry(effectiveConfig, "gpg.format"),
			sshProgram: getLatestConfigEntry(effectiveConfig, "gpg.ssh.program"),
			allowedSigners: getLatestConfigEntry(effectiveConfig, "gpg.ssh.allowedsignersfile"),
		};
	}, [effectiveConfig]);

	useEffect(() => {
		if (!activeTabOverride) return;
		setActiveTab(activeTabOverride);
	}, [activeTabOverride]);

	const loadEffectiveConfig = useCallback(() => {
		if (!projectId) {
			setEffectiveConfig([]);
			return;
		}
		window.gitagen.repo.getEffectiveConfig(projectId).then((entries: ConfigEntry[]) => {
			setEffectiveConfig(entries);
			const currentName = getLatestConfigValue(entries, "user.name");
			const currentEmail = getLatestConfigValue(entries, "user.email");
			const currentSign = getLatestConfigValue(entries, "commit.gpgsign").toLowerCase();
			const currentSigningKey = getLatestConfigValue(entries, "user.signingkey");
			setLocalUserName(currentName);
			setLocalUserEmail(currentEmail);
			setLocalSignEnabled(
				currentSign === "1" ||
					currentSign === "true" ||
					currentSign === "yes" ||
					currentSign === "on"
			);
			if (currentSigningKey) setSigningKey(currentSigningKey);
		});
	}, [projectId]);

	useEffect(() => {
		window.gitagen.settings.getGlobal().then((s: AppSettings) => {
			setGitPath(s.gitBinaryPath);
			setSignCommits(s.signing?.enabled ?? false);
			setSigningKey(s.signing?.key ?? "");
			setUiScale(s.uiScale ?? 1.0);
			setUiScaleText(String(Math.round((s.uiScale ?? 1.0) * 100)));
			setFontSize(s.fontSize ?? 14);
			setCommitMessageFontSize(s.commitMessageFontSize ?? 14);
			const ff = s.fontFamily ?? "geist";
			setFontFamily(ff);
			if (!isFontPreset(ff)) setCustomFontInput(ff);
			setGpuAcceleration(s.gpuAcceleration ?? true);
			setDevMode(s.devMode ?? false);
			setAutoExpandSingleFolder(s.autoExpandSingleFolder ?? true);
			setShowWorktreePanel(s.showWorktreePanel ?? true);
		});
		window.gitagen.settings.discoverGitBinaries().then(setGitBinaries);
		window.gitagen.settings.getSshAgentInfo().then(setSshAgentInfo);
		loadEffectiveConfig();
	}, [loadEffectiveConfig]);

	const updateSigningSettings = async (partial: Partial<{ enabled: boolean; key: string }>) => {
		const settings = await window.gitagen.settings.getGlobal();
		await window.gitagen.settings.setGlobal({
			signing: { ...settings.signing, ...partial },
		});
	};

	const handleSelectGitBinary = async () => {
		const path = await window.gitagen.settings.selectGitBinary();
		if (path) {
			setGitPath(path);
			if (!gitBinaries.includes(path)) setGitBinaries((prev) => [...prev, path].sort());
		}
	};

	const handleTestSigning = async () => {
		if (!projectId) return;
		const result = await window.gitagen.repo.testSigning(
			projectId,
			signingKey.trim() || undefined
		);
		setSigningTestResult(result);
	};

	const handleSaveLocalConfig = async () => {
		if (!projectId) return;
		setSavingLocalConfig(true);
		setLocalConfigMessage(null);
		try {
			await window.gitagen.repo.setLocalConfig(projectId, "user.name", localUserName);
			await window.gitagen.repo.setLocalConfig(projectId, "user.email", localUserEmail);
			await window.gitagen.repo.setLocalConfig(
				projectId,
				"commit.gpgsign",
				localSignEnabled ? "true" : "false"
			);
			await window.gitagen.repo.setLocalConfig(projectId, "gpg.format", "ssh");
			await window.gitagen.repo.setLocalConfig(projectId, "user.signingkey", signingKey);
			await updateSigningSettings({ key: signingKey });
			setLocalConfigMessage("Saved local git config.");
			loadEffectiveConfig();
		} catch (error) {
			setLocalConfigMessage(
				error instanceof Error ? error.message : "Failed to save local config."
			);
		} finally {
			setSavingLocalConfig(false);
		}
	};

	const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
		{ id: "general", label: "General", icon: <Settings size={16} /> },
		{ id: "git", label: "Git", icon: <GitBranch size={16} /> },
		{ id: "signing", label: "Signing", icon: <Key size={16} /> },
		{ id: "ai", label: "AI", icon: <Sparkles size={16} /> },
		{ id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
		{ id: "dev", label: "Dev", icon: <Bug size={16} /> },
	];

	return (
		<div className="settings-page flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-3 border-b border-(--border-secondary) px-4 py-3">
				<button
					type="button"
					onClick={onClose}
					className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-(--text-secondary) outline-none transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
				>
					<ArrowLeft size={16} />
					Back to repo
				</button>
			</div>
			<div className="flex min-h-0 flex-1">
				<nav
					className="flex shrink-0 flex-col gap-0.5 border-r border-(--border-secondary) py-3"
					style={{ width: 180 }}
				>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center gap-3 px-4 py-2.5 text-left text-sm outline-none transition-colors ${
								activeTab === tab.id
									? "bg-(--bg-active) font-medium text-(--text-primary)"
									: "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
							}`}
						>
							{tab.icon}
							{tab.label}
						</button>
					))}
				</nav>
				<div className="min-w-0 flex-1 overflow-auto">
					<div className="mx-auto max-w-150 px-6 py-6">
						{activeTab === "general" && (
							<div className="space-y-6">
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Git
									</h3>
									<label className="mb-1.5 block text-xs font-medium text-(--text-secondary)">
										Git binary
									</label>
									<p className="mb-2 text-xs text-(--text-muted)">
										Path to the git executable
									</p>
									<div className="flex gap-2">
										<select
											value={gitPath ?? ""}
											onChange={(e) =>
												setGitPath(
													(e.target as HTMLSelectElement).value || null
												)
											}
											className="input flex-1 text-[13px]"
										>
											<option value="">Auto (from PATH)</option>
											{gitBinaries.map((p) => (
												<option key={p} value={p}>
													{p}
												</option>
											))}
										</select>
										<button
											type="button"
											onClick={handleSelectGitBinary}
											className="btn btn-secondary"
										>
											Browse
										</button>
									</div>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										UI Scale
									</h3>
									<p className="mb-2 text-xs text-(--text-muted)">75% — 150%</p>
									<input
										type="text"
										value={uiScaleText}
										onChange={(e) => {
											setUiScaleText(e.target.value);
										}}
										onBlur={() => {
											const parsed = parseFloat(uiScaleText);
											const clamped = Number.isNaN(parsed)
												? 100
												: Math.min(150, Math.max(75, parsed));
											const v = clamped / 100;
											setUiScale(v);
											setUiScaleText(String(Math.round(clamped)));
											void updateSettings({ uiScale: v });
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												(e.target as HTMLInputElement).blur();
											}
										}}
										className="input w-20 text-[13px]"
									/>
									<span className="ml-2 text-xs text-(--text-muted)">%</span>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										GPU acceleration
									</h3>
									<p className="mb-2 text-xs text-(--text-muted)">
										Use hardware acceleration for smoother rendering. Disable if
										you see GPU-related errors or graphical glitches.
									</p>
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={gpuAcceleration}
											onChange={(e) => {
												const v = (e.target as HTMLInputElement).checked;
												setGpuAcceleration(v);
												window.gitagen.settings.setGlobal({
													gpuAcceleration: v,
												});
											}}
										/>
										<span className="text-sm text-(--text-secondary)">
											Use GPU acceleration
										</span>
									</label>
								</div>
							</div>
						)}
						{activeTab === "git" && (
							<div className="space-y-6">
								{!projectId ? (
									<div className="panel p-4">
										<p className="text-sm text-(--text-muted)">
											Open a project to edit its local git config.
										</p>
									</div>
								) : (
									<div className="panel p-4">
										<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
											Project local git config
										</h3>
										<p className="mb-3 text-xs text-(--text-muted)">
											user.name, user.email, commit.gpgsign for this
											repository
										</p>
										<div className="grid grid-cols-2 gap-3">
											<div>
												<label className="mb-1 block text-xs font-medium text-(--text-muted)">
													user.name
												</label>
												<input
													value={localUserName}
													onChange={(e) =>
														setLocalUserName(
															(e.target as HTMLInputElement).value
														)
													}
													className="input text-xs"
												/>
											</div>
											<div>
												<label className="mb-1 block text-xs font-medium text-(--text-muted)">
													user.email
												</label>
												<input
													value={localUserEmail}
													onChange={(e) =>
														setLocalUserEmail(
															(e.target as HTMLInputElement).value
														)
													}
													className="input text-xs"
												/>
											</div>
										</div>
										<label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-(--text-secondary)">
											<input
												type="checkbox"
												checked={localSignEnabled}
												onChange={(e) =>
													setLocalSignEnabled(
														(e.target as HTMLInputElement).checked
													)
												}
											/>
											commit.gpgsign (local)
										</label>
										<div className="mt-3 flex items-center gap-2">
											<button
												type="button"
												onClick={handleSaveLocalConfig}
												disabled={!projectId || savingLocalConfig}
												className="btn btn-secondary text-xs"
											>
												Apply to repo
											</button>
											{localConfigMessage && (
												<p className="text-xs text-(--text-muted)">
													{localConfigMessage}
												</p>
											)}
										</div>
										<div className="mt-3 max-h-32 overflow-auto rounded-md border border-(--border-primary) bg-(--bg-secondary) p-2">
											{effectiveConfig.length === 0 ? (
												<p className="text-xs text-(--text-muted)">
													No effective config entries found.
												</p>
											) : (
												effectiveConfig.slice(-20).map((entry, idx) => (
													<div
														key={`${entry.key}-${idx}`}
														className="mb-1 text-[10px]"
													>
														<span className="font-medium text-(--text-primary)">
															{entry.key}
														</span>
														<span className="text-(--text-muted)">
															{" "}
															= {entry.value} ({entry.scope},{" "}
															{entry.origin})
														</span>
													</div>
												))
											)}
										</div>
									</div>
								)}
							</div>
						)}
						{activeTab === "signing" && (
							<div className="space-y-6">
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										SSH agent
									</h3>
									<div className="rounded-md border border-(--border-primary) bg-(--bg-secondary) px-3 py-2 text-[13px]">
										<p className="font-medium text-(--text-primary)">
											{sshAgentInfo.name || "Default"}
										</p>
										{sshAgentInfo.path && (
											<p className="mt-0.5 truncate text-xs text-(--text-muted)">
												{sshAgentInfo.path}
											</p>
										)}
									</div>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Commit signing
									</h3>
									<label className="mb-3 flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={signCommits}
											onChange={async (e) => {
												const v = (e.target as HTMLInputElement).checked;
												setSignCommits(v);
												setLocalSignEnabled(v);
												await updateSigningSettings({ enabled: v });
											}}
										/>
										<span className="text-xs font-medium text-(--text-secondary)">
											Sign commits
										</span>
									</label>
									<label className="mb-1 block text-xs font-medium text-(--text-muted)">
										SSH signing key override
									</label>
									<p className="mb-2 text-[11px] text-(--text-muted)">
										Leave empty to use the key from your git config. Set a value
										here to override it for repos that don&apos;t have one
										configured.
									</p>
									<input
										value={signingKey}
										onChange={(e) =>
											setSigningKey((e.target as HTMLInputElement).value)
										}
										placeholder="Detected from git config (user.signingkey)"
										className="input w-full text-xs"
									/>
									<div className="mt-3 rounded-md border border-(--border-primary) bg-(--bg-secondary) px-3 py-2 text-[11px]">
										<p className="font-medium text-(--text-primary)">
											Effective signing config
										</p>
										<p className="mt-1 text-(--text-muted)">
											user.signingkey:{" "}
											{signingConfigEntries.key?.value || "not set"}{" "}
											{signingConfigEntries.key
												? `(${signingConfigEntries.key.scope}, ${signingConfigEntries.key.origin})`
												: ""}
										</p>
										<p className="mt-1 text-(--text-muted)">
											gpg.format:{" "}
											{signingConfigEntries.format?.value || "not set"}{" "}
											{signingConfigEntries.format
												? `(${signingConfigEntries.format.scope}, ${signingConfigEntries.format.origin})`
												: ""}
										</p>
										<p className="mt-1 text-(--text-muted)">
											gpg.ssh.program:{" "}
											{signingConfigEntries.sshProgram?.value || "not set"}{" "}
											{signingConfigEntries.sshProgram
												? `(${signingConfigEntries.sshProgram.scope}, ${signingConfigEntries.sshProgram.origin})`
												: ""}
										</p>
										<p className="mt-1 text-(--text-muted)">
											gpg.ssh.allowedsignersfile:{" "}
											{signingConfigEntries.allowedSigners?.value ||
												"not set"}{" "}
											{signingConfigEntries.allowedSigners
												? `(${signingConfigEntries.allowedSigners.scope}, ${signingConfigEntries.allowedSigners.origin})`
												: ""}
										</p>
									</div>
									<div className="mt-2 flex items-center gap-2">
										<button
											type="button"
											onClick={handleTestSigning}
											disabled={!projectId}
											className="btn btn-secondary text-xs"
										>
											Test signing
										</button>
										{signingTestResult && (
											<p
												className={`text-xs ${signingTestResult.ok ? "text-(--success)" : "text-(--danger)"}`}
											>
												{signingTestResult.message}
											</p>
										)}
									</div>
								</div>
							</div>
						)}
						{activeTab === "ai" && (
							<div className="space-y-6">
								<AISettingsSection />
							</div>
						)}
						{activeTab === "appearance" && (
							<div className="space-y-6">
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Theme
									</h3>
									<div className="flex gap-2">
										{(["light", "dark", "system"] as const).map((t) => (
											<button
												key={t}
												type="button"
												onClick={() => setTheme(t)}
												className={`btn capitalize ${
													theme === t ? "btn-primary" : "btn-secondary"
												}`}
											>
												{t}
											</button>
										))}
									</div>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Font family
									</h3>
									<p className="mb-2 text-xs text-(--text-muted)">
										Preset or type a custom font name from your system
									</p>
									<select
										value={isFontPreset(fontFamily) ? fontFamily : "custom"}
										onChange={(e) => {
											const v = (e.target as HTMLSelectElement).value;
											if (v === "custom") {
												const inputVal = isFontPreset(fontFamily)
													? ""
													: String(fontFamily);
												setCustomFontInput(inputVal);
												const nextFont = inputVal.trim() || "system";
												setFontFamily(nextFont);
												void updateSettings({ fontFamily: nextFont });
											} else {
												const preset = v as (typeof FONT_PRESETS)[number];
												setFontFamily(preset);
												void updateSettings({ fontFamily: preset });
											}
										}}
										className="input w-full text-[13px]"
									>
										<option value="geist">Geist</option>
										<option value="geist-pixel">Geist Pixel</option>
										<option value="system">System</option>
										<option value="custom">Custom...</option>
									</select>
									{!isFontPreset(fontFamily) && (
										<>
											<input
												type="text"
												value={customFontInput}
												onChange={(e) =>
													setCustomFontInput(
														(e.target as HTMLInputElement).value
													)
												}
												onBlur={() => {
													const v = customFontInput.trim();
													const next = v || "system";
													setFontFamily(next);
													setCustomFontInput(v ? v : "");
													void updateSettings({ fontFamily: next });
												}}
												placeholder="e.g. JetBrains Mono, Fira Code"
												className="input mt-2 w-full text-[13px]"
											/>
											<p
												className="mt-2 text-xs text-(--text-muted)"
												style={{
													fontFamily: customFontInput
														? `"${customFontInput}", sans-serif`
														: undefined,
												}}
											>
												Preview: The quick brown fox jumps over the lazy dog
											</p>
										</>
									)}
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Font size
									</h3>
									<p className="mb-2 text-xs text-(--text-muted)">12px — 18px</p>
									<input
										type="text"
										value={String(fontSize)}
										onChange={(e) => {
											const v = parseInt(
												(e.target as HTMLInputElement).value,
												10
											);
											if (!Number.isNaN(v))
												setFontSize(Math.min(18, Math.max(12, v)));
										}}
										onBlur={() => {
											const v = Math.min(18, Math.max(12, fontSize));
											setFontSize(v);
											void updateSettings({ fontSize: v });
										}}
										className="input w-20 text-[13px]"
									/>
									<span className="ml-2 text-xs text-(--text-muted)">px</span>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Commit message font size
									</h3>
									<p className="mb-2 text-xs text-(--text-muted)">12px — 18px</p>
									<input
										type="text"
										value={String(commitMessageFontSize)}
										onChange={(e) => {
											const v = parseInt(
												(e.target as HTMLInputElement).value,
												10
											);
											if (!Number.isNaN(v))
												setCommitMessageFontSize(
													Math.min(18, Math.max(12, v))
												);
										}}
										onBlur={() => {
											const v = Math.min(
												18,
												Math.max(12, commitMessageFontSize)
											);
											setCommitMessageFontSize(v);
											void updateSettings({
												commitMessageFontSize: v,
											});
										}}
										className="input w-20 text-[13px]"
									/>
									<span className="ml-2 text-xs text-(--text-muted)">px</span>
								</div>
								<div className="panel p-4">
									<h3 className="mb-1 text-sm font-semibold text-(--text-primary)">
										Auto-expand single folders
									</h3>
									<p className="mb-3 text-xs text-(--text-muted)">
										Automatically expand folders when they are the only folder
										at their level
									</p>
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={autoExpandSingleFolder}
											onChange={(e) => {
												const v = (e.target as HTMLInputElement).checked;
												setAutoExpandSingleFolder(v);
												void updateSettings({ autoExpandSingleFolder: v });
											}}
										/>
										<span className="text-sm text-(--text-secondary)">
											Enabled
										</span>
									</label>
								</div>
								<div className="panel p-4">
									<h3 className="mb-1 text-sm font-semibold text-(--text-primary)">
										Show worktree panel
									</h3>
									<p className="mb-3 text-xs text-(--text-muted)">
										Show the worktree panel at the bottom of the sidebar by
										default. You can always toggle it using the chevron.
									</p>
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={showWorktreePanel}
											onChange={(e) => {
												const v = (e.target as HTMLInputElement).checked;
												setShowWorktreePanel(v);
												void window.gitagen.settings.setGlobal({
													showWorktreePanel: v,
												});
											}}
										/>
										<span className="text-sm text-(--text-secondary)">
											Shown by default
										</span>
									</label>
								</div>
							</div>
						)}
						{activeTab === "dev" && (
							<div className="space-y-6">
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Developer Mode
									</h3>
									<p className="mb-3 text-xs text-(--text-muted)">
										Enable developer mode to show performance metrics and
										debugging tools.
									</p>
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={devMode}
											onChange={(e) => {
												const v = (e.target as HTMLInputElement).checked;
												setDevMode(v);
											}}
										/>
										<span className="text-sm text-(--text-secondary)">
											Enable dev mode
										</span>
									</label>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										FPS Monitor
									</h3>
									<p className="mb-3 text-xs text-(--text-muted)">
										When dev mode is enabled, an FPS monitor will be displayed
										in the bottom-right corner showing real-time frame rate and
										history.
									</p>
								</div>
							</div>
						)}
						<div className="mt-8 flex gap-3">
							<button
								type="button"
								onClick={async () => {
									const effectiveFontFamily = !isFontPreset(fontFamily)
										? customFontInput.trim() || fontFamily || "system"
										: fontFamily;
									await window.gitagen.settings.setGlobal({
										gitBinaryPath: gitPath,
										gpuAcceleration,
										devMode,
										autoExpandSingleFolder,
										showWorktreePanel,
									});
									await updateSettings({
										uiScale,
										fontSize,
										commitMessageFontSize,
										fontFamily: effectiveFontFamily,
									});
									setFontFamily(effectiveFontFamily);
									if (!isFontPreset(effectiveFontFamily)) {
										setCustomFontInput(effectiveFontFamily);
									}
									onClose();
								}}
								className="btn btn-primary"
							>
								Save
							</button>
							<button type="button" onClick={onClose} className="btn btn-secondary">
								Discard
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function App() {
	const [initialTheme, setInitialTheme] = useState<"dark" | "light" | "system">("system");
	const [initialSettings, setInitialSettings] = useState<{
		uiScale: number;
		fontSize: number;
		commitMessageFontSize: number;
		fontFamily: FontFamily;
		devMode: boolean;
		autoExpandSingleFolder: boolean;
		showWorktreePanel: boolean;
	}>({
		uiScale: 1.0,
		fontSize: 14,
		commitMessageFontSize: 14,
		fontFamily: "system",
		devMode: false,
		autoExpandSingleFolder: true,
		showWorktreePanel: true,
	});

	useEffect(() => {
		window.gitagen?.settings
			?.getGlobal?.()
			.then((s: AppSettings | undefined) => {
				if (s?.theme) setInitialTheme(s.theme);
				setInitialSettings({
					uiScale: s?.uiScale ?? 1.0,
					fontSize: s?.fontSize ?? 14,
					commitMessageFontSize: s?.commitMessageFontSize ?? 14,
					fontFamily: s?.fontFamily ?? "system",
					devMode: s?.devMode ?? false,
					autoExpandSingleFolder: s?.autoExpandSingleFolder ?? true,
					showWorktreePanel: s?.showWorktreePanel ?? true,
				});
			})
			.catch(() => {});
	}, []);

	return (
		<ThemeProvider initialTheme={initialTheme}>
			<SettingsProvider initialSettings={initialSettings}>
				<ToastProvider>
					<ErrorBoundary>
						<AppContent />
					</ErrorBoundary>
					<FpsMonitor enabled={initialSettings.devMode} />
				</ToastProvider>
			</SettingsProvider>
		</ThemeProvider>
	);
}
