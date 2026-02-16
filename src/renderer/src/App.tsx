/// <reference lib="dom" />
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
	ArrowLeft,
	GitBranch,
	Key,
	Sparkles,
	Palette,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import DiffViewer from "./components/DiffViewer";
import AllChangesView from "./components/AllChangesView";
import CommitPanel from "./components/CommitPanel";
import BranchSelector from "./components/BranchSelector";
import WorktreeSelector from "./components/WorktreeSelector";
import LogPanel from "./components/LogPanel";
import StashPanel from "./components/StashPanel";
import WorktreePanel from "./components/WorktreePanel";
import RemotePanel from "./components/RemotePanel";
import ConflictBanner from "./components/ConflictBanner";
import { ThemeProvider, useTheme } from "./theme/provider";
import { SettingsProvider, useSettings } from "./settings/provider";
import { ToastProvider } from "./toast/provider";
import type {
	Project,
	ProjectPrefs,
	RepoStatus,
	GitFileStatus,
	DiffStyle,
	ConfigEntry,
	AppSettings,
	AIProviderDescriptor,
	CommitStyle,
	AIProviderInstance,
	AIProviderType,
	ConflictState,
} from "../../shared/types";

type RightPanelTab = "log" | "stash" | "remote";
type ViewMode = "single" | "all";

const MAIN_LAYOUT_FALLBACK = [20, 80];
const CONTENT_LAYOUT_FALLBACK = [75, 25];

type Layout = { [id: string]: number };

function sanitizeTwoPanelLayout(
	layout: unknown,
	opts: {
		fallback: number[];
		firstMin: number;
		firstMax: number;
		secondMin: number;
		secondMax: number;
		allowSecondCollapse?: boolean;
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

	if (first < opts.firstMin || first > opts.firstMax) {
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

function AppContent() {
	const [projects, setProjects] = useState<Project[]>([]);
	const [activeProject, setActiveProject] = useState<Project | null>(null);
	const [status, setStatus] = useState<RepoStatus | null>(null);
	const [activeWorktreePath, setActiveWorktreePath] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
	const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");
	const [viewMode, setViewMode] = useState<ViewMode>("single");
	const [showSettings, setShowSettings] = useState(false);
	const [rightTab, setRightTab] = useState<RightPanelTab>("log");
	const [loading, setLoading] = useState(true);
	const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
	const rightPanelRef = useRef<PanelImperativeHandle>(null);

	const mainLayout = useDefaultLayout({
		id: "gitagen-main-layout-v3",
		storage: typeof localStorage !== "undefined" ? localStorage : undefined,
	});
	const contentLayout = useDefaultLayout({
		id: "gitagen-content-layout-v3",
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

	const refreshStatus = useCallback(() => {
		if (activeProject) {
			window.gitagen.settings
				.getProjectPrefs(activeProject.id)
				.then((p: ProjectPrefs | null) => {
					setActiveWorktreePath(p?.activeWorktreePath ?? null);
				});
			window.gitagen.repo.getStatus(activeProject.id).then(setStatus);
		}
	}, [activeProject?.id]);

	useEffect(() => {
		window.gitagen.projects.list().then((list: Project[]) => {
			setProjects(list);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		if (!activeProject) {
			setStatus(null);
			setActiveWorktreePath(null);
			setSelectedFile(null);
			return;
		}
		window.gitagen.projects.switchTo(activeProject.id).then(() => {
			window.gitagen.settings
				.getProjectPrefs(activeProject.id)
				.then((p: ProjectPrefs | null) => {
					setActiveWorktreePath(p?.activeWorktreePath ?? null);
				});
			window.gitagen.repo.getStatus(activeProject.id).then(setStatus);
		});
	}, [activeProject?.id]);

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
				console.error(`[${payload.name}] ${payload.message}`);
			}
		);
		return () => {
			unsubscribeUpdated();
			unsubscribeConflicts();
			unsubscribeErrors();
		};
	}, [activeProject?.id, refreshStatus]);

	const handleAddProject = async () => {
		const path: string | null = await window.gitagen.settings.selectFolder();
		if (!path) return;
		const name = path.split("/").filter(Boolean).pop() || "repo";
		const p = await window.gitagen.projects.add(name, path);
		setProjects((prev) => [p, ...prev]);
		setActiveProject(p);
	};

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-(--bg-primary)">
				<div className="text-sm text-(--text-muted)">Loading...</div>
			</div>
		);
	}

	if (projects.length === 0) {
		return (
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
		return (
			<div className="flex h-screen flex-col bg-(--bg-primary)">
				<div className="flex items-center justify-between border-b border-(--border-secondary) px-6 py-4">
					<h1 className="font-mono text-sm font-semibold tracking-tight text-(--text-primary)">
						PROJECTS
					</h1>
					<span className="font-mono text-xs text-(--text-muted)">{projects.length}</span>
				</div>
				<div className="flex-1 overflow-auto px-6 py-8">
					<div className="mx-auto w-full max-w-3xl">
						<div className="grid gap-3">
							{projects.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => setActiveProject(p)}
									className="group flex items-center gap-4 rounded-lg border border-(--border-secondary) bg-(--bg-secondary) px-5 py-4 text-left outline-none transition-all hover:border-(--border-primary) hover:bg-(--bg-hover)"
								>
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-(--bg-tertiary)">
										<FolderOpen
											size={20}
											className="text-(--text-muted) transition-colors group-hover:text-(--accent-primary)"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-(--text-primary)">
											{p.name}
										</p>
										<p className="font-mono truncate text-xs text-(--text-muted)">
											{p.path}
										</p>
									</div>
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={handleAddProject}
							className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-(--border-primary) bg-transparent px-5 py-4 text-sm text-(--text-muted) outline-none transition-all hover:border-(--accent-primary) hover:text-(--accent-primary)"
						>
							<Plus
								size={16}
								className="transition-transform group-hover:scale-110"
							/>
							Add repository
						</button>
					</div>
				</div>
			</div>
		);
	}

	const gitStatus = status
		? {
				repoPath: activeProject.path,
				staged: repoStatusToGitFileStatus(status, "staged"),
				unstaged: repoStatusToGitFileStatus(status, "unstaged"),
				untracked: repoStatusToGitFileStatus(status, "untracked"),
			}
		: null;

	if (!gitStatus) {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-4 bg-(--bg-primary)">
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
			</div>
		);
	}

	if (showSettings) {
		return (
			<div className="flex h-screen flex-col bg-(--bg-primary) animate-fade-in">
				<SettingsPanel
					projectId={activeProject.id}
					onClose={() => setShowSettings(false)}
				/>
			</div>
		);
	}

	return (
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
					defaultSize="20%"
					minSize="12%"
					maxSize="35%"
				>
					<div className="flex min-h-0 flex-1 overflow-hidden">
						<Sidebar
							status={gitStatus}
							selectedFile={selectedFile}
							onSelectFile={setSelectedFile}
							onBack={() => setActiveProject(null)}
							projects={projects}
							activeProject={activeProject}
							onProjectChange={setActiveProject}
							onAddProject={handleAddProject}
							onViewAll={() => {
								setViewMode("all");
							}}
						/>
					</div>
					<div className="shrink-0 border-t border-(--border-secondary)">
						<WorktreePanel
							projectId={activeProject.id}
							projectName={activeProject.name}
							projectPath={activeProject.path}
							currentBranch={status?.branch ?? ""}
							activeWorktreePath={activeWorktreePath}
							onRefresh={refreshStatus}
						/>
					</div>
				</Panel>
				<Separator className="panel-resize-handle" />
				<Panel id="main" className="flex min-w-0 flex-1 flex-col" minSize="40%">
					<div className="flex shrink-0 items-center gap-2 border-b border-(--border-secondary) bg-(--bg-toolbar) px-3 py-2">
						<div className="flex items-center gap-1">
							<WorktreeSelector
								projectId={activeProject.id}
								activeWorktreePath={activeWorktreePath}
								mainRepoPath={activeProject.path}
								onWorktreeChange={refreshStatus}
							/>
							<div className="mx-0.5 h-4 w-px bg-(--border-primary)" />
							<BranchSelector
								projectId={activeProject.id}
								currentBranch={status?.branch ?? ""}
								onBranchChange={refreshStatus}
							/>
						</div>
						<div className="mx-0.5 hidden h-4 w-px bg-(--border-primary) sm:block" />
						<div className="hidden items-center tab-bar sm:flex">
							<button
								type="button"
								onClick={() => setViewMode("single")}
								title="Single file view"
								className="tab-item"
								data-active={viewMode === "single"}
							>
								<FileText size={14} />
							</button>
							<button
								type="button"
								onClick={() => setViewMode("all")}
								title="All changes view"
								className="tab-item"
								data-active={viewMode === "all"}
							>
								<FileStack size={14} />
							</button>
						</div>
						<div className="hidden items-center tab-bar md:flex">
							<button
								type="button"
								onClick={() => setDiffStyle("unified")}
								title="Unified diff"
								className="tab-item"
								data-active={diffStyle === "unified"}
							>
								<Rows3 size={14} />
							</button>
							<button
								type="button"
								onClick={() => setDiffStyle("split")}
								title="Split diff"
								className="tab-item"
								data-active={diffStyle === "split"}
							>
								<Columns size={14} />
							</button>
						</div>
						<div className="ml-auto flex items-center gap-1">
							<button
								type="button"
								onClick={toggleRightPanel}
								className="btn-icon rounded-md p-2"
								title={isRightPanelCollapsed ? "Show panel" : "Hide panel"}
							>
								{isRightPanelCollapsed ? (
									<PanelRight size={16} />
								) : (
									<PanelRightClose size={16} />
								)}
							</button>
							<button
								type="button"
								onClick={() => setShowSettings(true)}
								className="btn-icon rounded-md p-2"
								title="Settings"
							>
								<Settings size={16} />
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
							<CommitPanel projectId={activeProject.id} onCommit={refreshStatus} />
						</Panel>
						<Separator className="panel-resize-handle" />
						<Panel
							id="right"
							className="hidden flex-col border-l border-(--border-secondary) md:flex"
							collapsible
							defaultSize="25%"
							minSize="15%"
							maxSize="45%"
							panelRef={rightPanelRef}
							onResize={(size) => {
								setIsRightPanelCollapsed(size.asPercentage < 1);
							}}
						>
							<div className="flex flex-col min-h-0 flex-1">
								<div className="flex tab-bar border-b border-(--border-secondary) m-2 mb-0">
									<button
										type="button"
										onClick={() => setRightTab("log")}
										className="tab-item flex-1"
										data-active={rightTab === "log"}
									>
										<History size={14} />
										<span className="hidden lg:inline">Log</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("stash")}
										className="tab-item flex-1"
										data-active={rightTab === "stash"}
									>
										<Archive size={14} />
										<span className="hidden lg:inline">Stash</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("remote")}
										className="tab-item flex-1"
										data-active={rightTab === "remote"}
									>
										<Cloud size={14} />
										<span className="hidden lg:inline">Remote</span>
									</button>
								</div>
								<div className="min-h-0 flex-1 overflow-auto bg-(--bg-primary)">
									{rightTab === "log" && (
										<LogPanel projectId={activeProject.id} />
									)}
									{rightTab === "stash" && (
										<StashPanel
											projectId={activeProject.id}
											onRefresh={refreshStatus}
										/>
									)}
									{rightTab === "remote" && (
										<RemotePanel
											projectId={activeProject.id}
											onRefresh={refreshStatus}
										/>
									)}
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
		if (list.length > 0 && !list.some((provider) => provider.id === newProviderType)) {
			setNewProviderType(list[0].id);
		}
	}, [newProviderType]);

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

	useEffect(() => {
		if (!showAddForm) return;
		if (!newProviderApiKey.trim()) return;
		if (requiresBaseURL && !newProviderBaseURL.trim()) return;

		const timer = window.setTimeout(() => {
			void handleFetchNewProviderModels({ silent: true });
		}, 400);

		return () => window.clearTimeout(timer);
	}, [
		handleFetchNewProviderModels,
		newProviderApiKey,
		newProviderBaseURL,
		requiresBaseURL,
		showAddForm,
	]);

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

			{showAddForm && (
				<div className="mb-3 rounded-lg border border-(--border-primary) bg-(--bg-secondary) p-3 space-y-2">
					<p className="text-xs font-medium text-(--text-secondary)">Add new provider</p>
					{providerTypes.length === 0 ? (
						<p className="text-xs text-(--danger)">No provider types are available.</p>
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
										setNewProviderBaseURL((e.target as HTMLInputElement).value)
									}
									placeholder="Base URL (e.g. https://api.example.com/v1)"
									className="input w-full text-xs"
								/>
							)}
							<div className="flex gap-2">
								<input
									value={newProviderApiKey}
									onChange={(e) =>
										setNewProviderApiKey((e.target as HTMLInputElement).value)
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
							{modelError && <p className="text-xs text-(--danger)">{modelError}</p>}
							<input
								value={newProviderModelSearch}
								onChange={(e) =>
									setNewProviderModelSearch((e.target as HTMLInputElement).value)
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
									onKeyDown={(e) => e.key === "Enter" && handleAddCustomModel()}
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
									onClick={handleAddProvider}
									className="btn btn-primary text-xs"
								>
									Add
								</button>
								<button
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
				</div>
			)}

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
							{editingProvider?.id === provider.id ? (
								<ProviderEditForm
									provider={editingProvider}
									requiresBaseURL={
										providerById[editingProvider.type]?.requiresBaseURL ?? false
									}
									onSave={handleUpdateProvider}
									onCancel={() => setEditingProvider(null)}
								/>
							) : (
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<p className="text-xs font-medium text-(--text-primary)">
											{provider.name}
										</p>
										<p className="text-[10px] text-(--text-muted)">
											{providerById[provider.type]?.displayName ??
												provider.type}
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
							)}
						</div>
					))}
				</div>
			)}
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

	useEffect(() => {
		if (!apiKey.trim()) return;
		if (requiresBaseURL && !baseURL.trim()) return;
		if (models.length > 0) return;

		const timer = window.setTimeout(() => {
			void handleFetchModels({ silent: true });
		}, 400);

		return () => window.clearTimeout(timer);
	}, [apiKey, baseURL, handleFetchModels, models.length, requiresBaseURL]);

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

type SettingsTab = "general" | "git" | "signing" | "ai" | "appearance";

function SettingsPanel({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
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
	const [fontSize, setFontSize] = useState(14);
	const [commitMessageFontSize, setCommitMessageFontSize] = useState(14);
	const [fontFamily, setFontFamily] = useState<"geist" | "geist-pixel" | "system">("geist");
	const [gpuAcceleration, setGpuAcceleration] = useState(true);

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
			setFontSize(s.fontSize ?? 14);
			setCommitMessageFontSize(s.commitMessageFontSize ?? 14);
			setFontFamily(s.fontFamily ?? "geist");
			setGpuAcceleration(s.gpuAcceleration ?? true);
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
		const result = await window.gitagen.repo.testSigning(projectId, signingKey);
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
					<div className="mx-auto max-w-[600px] px-6 py-6">
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
										value={String(Math.round(uiScale * 100))}
										onChange={(e) => {
											const v = parseFloat(
												(e.target as HTMLInputElement).value
											);
											if (!Number.isNaN(v))
												setUiScale(Math.min(150, Math.max(75, v)) / 100);
										}}
										onBlur={() => {
											const v = Math.min(1.5, Math.max(0.75, uiScale));
											setUiScale(v);
											void updateSettings({ uiScale: v });
										}}
										className="input w-20 text-[13px]"
									/>
									<span className="ml-2 text-xs text-(--text-muted)">%</span>
								</div>
								<div className="panel p-4">
									<h3 className="mb-3 text-sm font-semibold text-(--text-primary)">
										Font Size
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
										SSH signing key
									</label>
									<p className="mb-2 text-[11px] text-(--text-muted)">
										Detected from git config when a project is open. Override
										here to change or set for repos that don&apos;t have it yet.
									</p>
									<input
										value={signingKey}
										onChange={(e) =>
											setSigningKey((e.target as HTMLInputElement).value)
										}
										placeholder="e.g. ~/.ssh/id_ed25519.pub or key fingerprint"
										className="input w-full text-xs"
									/>
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
										System, Geist, or Geist Pixel
									</p>
									<select
										value={fontFamily}
										onChange={(e) => {
											const v = (e.target as HTMLSelectElement).value as
												| "geist"
												| "geist-pixel"
												| "system";
											setFontFamily(v);
											void updateSettings({ fontFamily: v });
										}}
										className="input w-full text-[13px]"
									>
										<option value="geist">Geist</option>
										<option value="geist-pixel">Geist Pixel</option>
										<option value="system">System</option>
									</select>
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
							</div>
						)}
						<div className="mt-8 flex gap-3">
							<button
								type="button"
								onClick={async () => {
									await window.gitagen.settings.setGlobal({
										gitBinaryPath: gitPath,
										gpuAcceleration,
									});
									await updateSettings({
										uiScale,
										fontSize,
										commitMessageFontSize,
										fontFamily,
									});
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
		fontFamily: "geist" | "geist-pixel" | "system";
	}>({
		uiScale: 1.0,
		fontSize: 14,
		commitMessageFontSize: 14,
		fontFamily: "system",
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
				});
			})
			.catch(() => {});
	}, []);

	return (
		<ThemeProvider initialTheme={initialTheme}>
			<SettingsProvider initialSettings={initialSettings}>
				<ToastProvider>
					<AppContent />
				</ToastProvider>
			</SettingsProvider>
		</ThemeProvider>
	);
}
