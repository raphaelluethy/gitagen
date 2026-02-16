import { useState, useEffect, useCallback, useMemo } from "react";
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
import { SettingsProvider } from "./settings/provider";
import type {
	Project,
	RepoStatus,
	GitFileStatus,
	DiffStyle,
	ConfigEntry,
	AIProviderDescriptor,
	AIProviderInstance,
	AIProviderType,
} from "../../shared/types";

type RightPanelTab = "log" | "stash" | "remote";
type ViewMode = "single" | "all";

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
	const [showRightPanel, setShowRightPanel] = useState(true);
	const [loading, setLoading] = useState(true);

	const refreshStatus = useCallback(() => {
		if (activeProject) {
			window.gitagen.settings.getProjectPrefs(activeProject.id).then((p) => {
				setActiveWorktreePath(p?.activeWorktreePath ?? null);
			});
			window.gitagen.repo.getStatus(activeProject.id).then(setStatus);
		}
	}, [activeProject?.id]);

	useEffect(() => {
		window.gitagen.projects.list().then((list) => {
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
			window.gitagen.settings.getProjectPrefs(activeProject.id).then((p) => {
				setActiveWorktreePath(p?.activeWorktreePath ?? null);
			});
			window.gitagen.repo.getStatus(activeProject.id).then(setStatus);
		});
	}, [activeProject?.id]);

	useEffect(() => {
		const unsubscribeUpdated = window.gitagen.events.onRepoUpdated((payload) => {
			if (!activeProject || payload.projectId !== activeProject.id) return;
			refreshStatus();
		});
		const unsubscribeConflicts = window.gitagen.events.onConflictDetected((payload) => {
			if (!activeProject || payload.projectId !== activeProject.id) return;
			refreshStatus();
		});
		const unsubscribeErrors = window.gitagen.events.onRepoError((payload) => {
			if (!activeProject) return;
			if (payload.projectId && payload.projectId !== activeProject.id) return;
			console.error(`[${payload.name}] ${payload.message}`);
		});
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
			<div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
				<div className="text-sm text-[var(--text-muted)]">Loading...</div>
			</div>
		);
	}

	if (projects.length === 0) {
		return (
			<div className="empty-state h-screen bg-[var(--bg-primary)]">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-secondary)]">
					<FolderOpen size={32} className="text-[var(--text-muted)]" />
				</div>
				<div className="text-center">
					<p className="text-lg font-semibold text-[var(--text-primary)]">
						No projects yet
					</p>
					<p className="mt-2 text-sm text-[var(--text-muted)] max-w-sm">
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
			<div className="flex h-screen flex-col bg-[var(--bg-primary)]">
				<div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-6 py-4">
					<h1 className="font-mono text-sm font-semibold tracking-tight text-[var(--text-primary)]">
						PROJECTS
					</h1>
					<span className="font-mono text-xs text-[var(--text-muted)]">
						{projects.length}
					</span>
				</div>
				<div className="flex-1 overflow-auto px-6 py-8">
					<div className="mx-auto w-full max-w-3xl">
						<div className="grid gap-3">
							{projects.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => setActiveProject(p)}
									className="group flex items-center gap-4 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-5 py-4 text-left outline-none transition-all hover:border-[var(--border-primary)] hover:bg-[var(--bg-hover)]"
								>
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bg-tertiary)]">
										<FolderOpen
											size={20}
											className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-primary)]"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-[var(--text-primary)]">
											{p.name}
										</p>
										<p className="font-mono truncate text-xs text-[var(--text-muted)]">
											{p.path}
										</p>
									</div>
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={handleAddProject}
							className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-primary)] bg-transparent px-5 py-4 text-sm text-[var(--text-muted)] outline-none transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
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
			<div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]">
				<p className="text-sm text-[var(--text-muted)]">
					Not a git repository or failed to load status.
				</p>
				<button
					type="button"
					onClick={() => setActiveProject(null)}
					className="text-sm text-[var(--accent-primary)] hover:underline"
				>
					Back to projects
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col bg-[var(--bg-primary)]">
			<ConflictBanner projectId={activeProject.id} onResolved={refreshStatus} />
			<div className="flex flex-1 min-h-0">
				<div
					className="flex shrink-0 flex-col border-r border-[var(--border-secondary)]"
					style={{ width: "var(--sidebar-width)" }}
				>
					<div className="flex-1 min-h-0 overflow-hidden">
						<Sidebar
							status={gitStatus}
							selectedFile={selectedFile}
							onSelectFile={setSelectedFile}
							onBack={() => setActiveProject(null)}
						/>
					</div>
					<div className="shrink-0 border-t border-[var(--border-secondary)]">
						<WorktreePanel
							projectId={activeProject.id}
							projectName={activeProject.name}
							projectPath={activeProject.path}
							currentBranch={status?.branch ?? ""}
							activeWorktreePath={activeWorktreePath}
							onRefresh={refreshStatus}
						/>
					</div>
				</div>
				<main className="flex min-w-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-secondary)] bg-[var(--bg-toolbar)] px-3 py-2">
						<div className="flex items-center gap-1">
							<WorktreeSelector
								projectId={activeProject.id}
								activeWorktreePath={activeWorktreePath}
								mainRepoPath={activeProject.path}
								onWorktreeChange={refreshStatus}
							/>
							<div className="mx-0.5 h-4 w-px bg-[var(--border-primary)]" />
							<BranchSelector
								projectId={activeProject.id}
								currentBranch={status?.branch ?? ""}
								onBranchChange={refreshStatus}
							/>
						</div>
						<div className="mx-0.5 hidden h-4 w-px bg-[var(--border-primary)] sm:block" />
						<div className="hidden items-center rounded-lg bg-[var(--bg-tertiary)] p-0.5 sm:flex">
							<button
								type="button"
								onClick={() => setViewMode("single")}
								title="Single file view"
								className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none ${
									viewMode === "single"
										? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
										: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
								}`}
							>
								<FileText size={13} />
								<span className="hidden lg:inline">File</span>
							</button>
							<button
								type="button"
								onClick={() => setViewMode("all")}
								title="All changes view"
								className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none ${
									viewMode === "all"
										? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
										: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
								}`}
							>
								<FileStack size={13} />
								<span className="hidden lg:inline">All</span>
							</button>
						</div>
						<div className="hidden items-center rounded-lg bg-[var(--bg-tertiary)] p-0.5 md:flex">
							<button
								type="button"
								onClick={() => setDiffStyle("unified")}
								title="Unified diff"
								className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none ${
									diffStyle === "unified"
										? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
										: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
								}`}
							>
								<Rows3 size={13} />
								<span className="hidden lg:inline">Stacked</span>
							</button>
							<button
								type="button"
								onClick={() => setDiffStyle("split")}
								title="Split diff"
								className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none ${
									diffStyle === "split"
										? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
										: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
								}`}
							>
								<Columns size={13} />
								<span className="hidden lg:inline">Split</span>
							</button>
						</div>
						<div className="ml-auto flex items-center gap-1">
							<button
								type="button"
								onClick={() => setShowRightPanel(!showRightPanel)}
								className="btn-icon rounded-[var(--radius-md)] p-2"
								title={showRightPanel ? "Hide panel" : "Show panel"}
							>
								{showRightPanel ? (
									<PanelRightClose size={16} />
								) : (
									<PanelRight size={16} />
								)}
							</button>
							<button
								type="button"
								onClick={() => setShowSettings(true)}
								className="btn-icon rounded-[var(--radius-md)] p-2"
								title="Settings"
							>
								<Settings size={16} />
							</button>
						</div>
					</div>
					<div className="flex min-h-0 flex-1">
						<div className="flex min-w-0 flex-1 flex-col">
							{viewMode === "all" ? (
								<AllChangesView
									projectId={activeProject.id}
									gitStatus={gitStatus}
									diffStyle={diffStyle}
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
						</div>
						{showRightPanel && (
							<div
								className="hidden shrink-0 flex-col border-l border-[var(--border-secondary)] md:flex"
								style={{ width: "var(--right-panel-width)" }}
							>
								<div className="flex border-b border-[var(--border-secondary)]">
									<button
										type="button"
										onClick={() => setRightTab("log")}
										className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 text-xs font-medium outline-none ${
											rightTab === "log"
												? "border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]"
												: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
										}`}
									>
										<History size={14} />
										<span className="hidden lg:inline">Log</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("stash")}
										className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 text-xs font-medium outline-none ${
											rightTab === "stash"
												? "border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]"
												: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
										}`}
									>
										<Archive size={14} />
										<span className="hidden lg:inline">Stash</span>
									</button>
									<button
										type="button"
										onClick={() => setRightTab("remote")}
										className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 text-xs font-medium outline-none ${
											rightTab === "remote"
												? "border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]"
												: "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
										}`}
									>
										<Cloud size={14} />
										<span className="hidden lg:inline">Remote</span>
									</button>
								</div>
								<div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-primary)]">
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
						)}
					</div>
				</main>
			</div>
			{showSettings && (
				<SettingsPanel
					projectId={activeProject.id}
					onClose={() => setShowSettings(false)}
				/>
			)}
		</div>
	);
}

function AISettingsSection() {
	const [providers, setProviders] = useState<AIProviderInstance[]>([]);
	const [providerTypes, setProviderTypes] = useState<AIProviderDescriptor[]>([]);
	const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
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
		const entries = providerTypes.map((provider) => [provider.id, provider] as const);
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
			},
		});
		void loadProviders();
	};

	const handleSetActive = async (id: string) => {
		await window.gitagen.settings.setGlobal({
			ai: { providers, activeProviderId: id },
		});
		setActiveProviderId(id);
	};

	return (
		<div className="rounded-lg border border-[var(--border-primary)] p-3">
			<div className="mb-3 flex items-center justify-between">
				<p className="text-xs font-medium text-[var(--text-secondary)]">AI Providers</p>
				<button
					type="button"
					onClick={() => setShowAddForm(true)}
					className="btn btn-secondary text-xs"
				>
					+ Add
				</button>
			</div>

			{showAddForm && (
				<div className="mb-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 space-y-2">
					<p className="text-xs font-medium text-[var(--text-secondary)]">
						Add new provider
					</p>
					{providerTypes.length === 0 ? (
						<p className="text-xs text-[var(--danger)]">
							No provider types are available.
						</p>
					) : (
						<>
							<select
								value={newProviderType}
								onChange={(e) => {
									setNewProviderType(e.target.value as AIProviderType);
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
								onChange={(e) => setNewProviderName(e.target.value)}
								placeholder="Provider name (optional)"
								className="input w-full text-xs"
							/>
							{requiresBaseURL && (
								<input
									value={newProviderBaseURL}
									onChange={(e) => setNewProviderBaseURL(e.target.value)}
									placeholder="Base URL (e.g. https://api.example.com/v1)"
									className="input w-full text-xs"
								/>
							)}
							<div className="flex gap-2">
								<input
									value={newProviderApiKey}
									onChange={(e) => setNewProviderApiKey(e.target.value)}
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
								<p className="text-xs text-[var(--danger)]">{modelError}</p>
							)}
							<input
								value={newProviderModelSearch}
								onChange={(e) => setNewProviderModelSearch(e.target.value)}
								placeholder="Search models"
								className="input w-full text-xs"
							/>
							<select
								value={newProviderDefaultModel}
								onChange={(e) => setNewProviderDefaultModel(e.target.value)}
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
									onChange={(e) => setNewProviderCustomModelInput(e.target.value)}
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
				<p className="text-xs text-[var(--text-muted)]">No AI providers configured.</p>
			) : (
				<div className="space-y-2">
					{providers.map((provider) => (
						<div
							key={provider.id}
							className={`rounded-lg border p-2 ${
								activeProviderId === provider.id
									? "border-[var(--accent)] bg-[var(--accent)]/5"
									: "border-[var(--border-primary)]"
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
										<p className="text-xs font-medium text-[var(--text-primary)]">
											{provider.name}
										</p>
										<p className="text-[10px] text-[var(--text-muted)]">
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
												className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
											>
												Set Active
											</button>
										)}
										<button
											type="button"
											onClick={() => setEditingProvider(provider)}
											className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
										>
											Edit
										</button>
										<button
											type="button"
											onClick={() => handleDeleteProvider(provider.id)}
											className="rounded px-1.5 py-0.5 text-[10px] text-[var(--danger)] hover:bg-[var(--bg-secondary)]"
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
				onChange={(e) => setName(e.target.value)}
				placeholder="Provider name"
				className="input w-full text-xs"
			/>
			<div className="flex gap-2">
				<input
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
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
			{modelError && <p className="text-xs text-[var(--danger)]">{modelError}</p>}
			{requiresBaseURL && (
				<input
					value={baseURL}
					onChange={(e) => setBaseURL(e.target.value)}
					placeholder="Base URL (e.g. https://api.example.com/v1)"
					className="input w-full text-xs"
				/>
			)}
			<input
				value={modelSearch}
				onChange={(e) => setModelSearch(e.target.value)}
				placeholder="Search models"
				className="input w-full text-xs"
			/>
			<select
				value={defaultModel}
				onChange={(e) => setDefaultModel(e.target.value)}
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
					onChange={(e) => setCustomModelInput(e.target.value)}
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

function SettingsPanel({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
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
	const [uiScale, setUiScale] = useState(1.0);
	const [fontSize, setFontSize] = useState(14);
	const [commitMessageFontSize, setCommitMessageFontSize] = useState(14);

	const loadEffectiveConfig = useCallback(() => {
		if (!projectId) {
			setEffectiveConfig([]);
			return;
		}
		window.gitagen.repo.getEffectiveConfig(projectId).then((entries) => {
			setEffectiveConfig(entries);
			const currentName = getLatestConfigValue(entries, "user.name");
			const currentEmail = getLatestConfigValue(entries, "user.email");
			const currentSign = getLatestConfigValue(entries, "commit.gpgsign").toLowerCase();
			setLocalUserName(currentName);
			setLocalUserEmail(currentEmail);
			setLocalSignEnabled(
				currentSign === "1" ||
					currentSign === "true" ||
					currentSign === "yes" ||
					currentSign === "on"
			);
		});
	}, [projectId]);

	useEffect(() => {
		window.gitagen.settings.getGlobal().then((s) => {
			setGitPath(s.gitBinaryPath);
			setSignCommits(s.signing?.enabled ?? false);
			setSigningKey(s.signing?.key ?? "");
			setUiScale(s.uiScale ?? 1.0);
			setFontSize(s.fontSize ?? 14);
			setCommitMessageFontSize(s.commitMessageFontSize ?? 14);
		});
		window.gitagen.settings.discoverGitBinaries().then(setGitBinaries);
		window.gitagen.settings.getSshAgentInfo().then(setSshAgentInfo);
		loadEffectiveConfig();
	}, [loadEffectiveConfig]);

	const updateSigningSettings = async (
		partial: Partial<{ enabled: boolean; key: string }>
	) => {
		const settings = await window.gitagen.settings.getGlobal();
		await window.gitagen.settings.setGlobal({
			signing: { ...settings.signing, ...partial },
		});
	};

	const handleGitBinaryChange = (value: string) => {
		const path = value === "" ? null : value;
		setGitPath(path);
		window.gitagen.settings.setGlobal({ gitBinaryPath: path });
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

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<div
				className="w-full max-w-2xl rounded-lg bg-[var(--bg-primary)] p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">Settings</h2>
				<div className="space-y-5">
					<div>
						<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
							Git binary
						</label>
						<div className="flex gap-2">
							<select
								value={gitPath ?? ""}
								onChange={(e) => handleGitBinaryChange(e.target.value)}
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
					<div>
						<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
							SSH agent
						</label>
						<div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-[13px]">
							<p className="font-medium text-[var(--text-primary)]">
								{sshAgentInfo.name || "Default"}
							</p>
							{sshAgentInfo.path && (
								<p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
									{sshAgentInfo.path}
								</p>
							)}
						</div>
					</div>
					<div>
						<label className="mb-1.5 flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={signCommits}
								onChange={async (e) => {
									const v = e.target.checked;
									setSignCommits(v);
									setLocalSignEnabled(v);
									await updateSigningSettings({ enabled: v });
								}}
							/>
							<span className="text-xs font-medium text-[var(--text-secondary)]">
								Sign commits
							</span>
						</label>
						<div className="mt-2">
							<label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
								SSH signing key
							</label>
							<input
								value={signingKey}
								onChange={async (e) => {
									const next = e.target.value;
									setSigningKey(next);
									await updateSigningSettings({ key: next });
								}}
								placeholder="key id or path"
								className="input w-full text-xs"
							/>
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
									className={`text-xs ${signingTestResult.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
								>
									{signingTestResult.message}
								</p>
							)}
						</div>
					</div>
					<div className="rounded-lg border border-[var(--border-primary)] p-3">
						<p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
							Project local git config
						</p>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
									user.name
								</label>
								<input
									value={localUserName}
									onChange={(e) => setLocalUserName(e.target.value)}
									className="input text-xs"
								/>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
									user.email
								</label>
								<input
									value={localUserEmail}
									onChange={(e) => setLocalUserEmail(e.target.value)}
									className="input text-xs"
								/>
							</div>
						</div>
						<label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
							<input
								type="checkbox"
								checked={localSignEnabled}
								onChange={(e) => setLocalSignEnabled(e.target.checked)}
							/>
							commit.gpgsign (local)
						</label>
						<div className="mt-2 flex items-center gap-2">
							<button
								type="button"
								onClick={handleSaveLocalConfig}
								disabled={!projectId || savingLocalConfig}
								className="btn btn-secondary text-xs"
							>
								Apply to repo
							</button>
							{localConfigMessage && (
								<p className="text-xs text-[var(--text-muted)]">
									{localConfigMessage}
								</p>
							)}
						</div>
						<div className="mt-3 max-h-32 overflow-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2">
							{effectiveConfig.length === 0 ? (
								<p className="text-xs text-[var(--text-muted)]">
									No effective config entries found.
								</p>
							) : (
								effectiveConfig.slice(-20).map((entry, idx) => (
									<div key={`${entry.key}-${idx}`} className="mb-1 text-[10px]">
										<span className="font-medium text-[var(--text-primary)]">
											{entry.key}
										</span>
										<span className="text-[var(--text-muted)]">
											{" "}
											= {entry.value} ({entry.scope}, {entry.origin})
										</span>
									</div>
								))
							)}
						</div>
					</div>
					<div className="space-y-4">
						<div>
							<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
								UI Scale
							</label>
							<div className="flex items-center gap-3">
								<input
									type="range"
									min="0.75"
									max="1.5"
									step="0.25"
									value={uiScale}
									onChange={(e) => {
										const v = parseFloat(e.target.value);
										setUiScale(v);
										window.gitagen.settings.setGlobal({ uiScale: v });
									}}
									className="flex-1"
								/>
								<span className="font-mono text-xs text-[var(--text-muted)] w-12 text-right">
									{Math.round(uiScale * 100)}%
								</span>
							</div>
						</div>
						<div>
							<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
								Font Size
							</label>
							<div className="flex items-center gap-3">
								<input
									type="range"
									min="12"
									max="18"
									step="1"
									value={fontSize}
									onChange={(e) => {
										const v = parseInt(e.target.value, 10);
										setFontSize(v);
										window.gitagen.settings.setGlobal({ fontSize: v });
									}}
									className="flex-1"
								/>
								<span className="font-mono text-xs text-[var(--text-muted)] w-12 text-right">
									{fontSize}px
								</span>
							</div>
						</div>
						<div>
							<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
								Commit Message Font Size
							</label>
							<div className="flex items-center gap-3">
								<input
									type="range"
									min="12"
									max="18"
									step="1"
									value={commitMessageFontSize}
									onChange={(e) => {
										const v = parseInt(e.target.value, 10);
										setCommitMessageFontSize(v);
										window.gitagen.settings.setGlobal({
											commitMessageFontSize: v,
										});
									}}
									className="flex-1"
								/>
								<span className="font-mono text-xs text-[var(--text-muted)] w-12 text-right">
									{commitMessageFontSize}px
								</span>
							</div>
						</div>
					</div>
					<div>
						<label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
							Theme
						</label>
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
					<AISettingsSection />
				</div>
				<button type="button" onClick={onClose} className="btn btn-secondary mt-6 w-full">
					Close
				</button>
			</div>
		</div>
	);
}

export default function App() {
	const [initialTheme, setInitialTheme] = useState<"dark" | "light" | "system">("system");
	const [initialSettings, setInitialSettings] = useState({
		uiScale: 1.0,
		fontSize: 14,
		commitMessageFontSize: 14,
	});

	useEffect(() => {
		window.gitagen?.settings
			?.getGlobal?.()
			.then((s) => {
				if (s?.theme) setInitialTheme(s.theme);
				setInitialSettings({
					uiScale: s?.uiScale ?? 1.0,
					fontSize: s?.fontSize ?? 14,
					commitMessageFontSize: s?.commitMessageFontSize ?? 14,
				});
			})
			.catch(() => {});
	}, []);

	return (
		<ThemeProvider initialTheme={initialTheme}>
			<SettingsProvider initialSettings={initialSettings}>
				<AppContent />
			</SettingsProvider>
		</ThemeProvider>
	);
}
