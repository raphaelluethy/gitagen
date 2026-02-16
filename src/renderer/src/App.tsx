import { useState, useEffect, useCallback } from "react";
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
import type {
	Project,
	RepoStatus,
	GitFileStatus,
	DiffStyle,
	ConfigEntry,
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
			<div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-400">
				Loading...
			</div>
		);
	}

	if (projects.length === 0) {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-4 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
				<p className="text-lg">No projects yet</p>
				<button
					type="button"
					onClick={handleAddProject}
					className="flex items-center gap-2 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
				>
					<Plus size={16} />
					Add current directory
				</button>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="flex h-screen flex-col bg-white dark:bg-zinc-950">
				<div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
					<h1 className="text-lg font-semibold dark:text-zinc-100">Projects</h1>
				</div>
				<div className="flex-1 overflow-auto p-4">
					{projects.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => setActiveProject(p)}
							className="mb-2 flex w-full items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
						>
							<FolderOpen size={20} className="text-zinc-500" />
							<div>
								<p className="font-medium dark:text-zinc-200">{p.name}</p>
								<p className="text-xs text-zinc-500 dark:text-zinc-400">{p.path}</p>
							</div>
						</button>
					))}
					<button
						type="button"
						onClick={handleAddProject}
						className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
					>
						<Plus size={16} />
						Add project
					</button>
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
			<div className="flex h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-zinc-950">
				<p className="text-zinc-600 dark:text-zinc-400">
					Not a git repository or failed to load status.
				</p>
				<button
					type="button"
					onClick={() => setActiveProject(null)}
					className="rounded px-4 py-2 text-sm text-zinc-500 hover:underline"
				>
					Back to projects
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
			<ConflictBanner projectId={activeProject.id} onResolved={refreshStatus} />
			<div className="flex flex-1 min-h-0">
				<div className="flex w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
					<div className="flex-1 min-h-0 overflow-hidden">
						<Sidebar
							status={gitStatus}
							selectedFile={selectedFile}
							onSelectFile={setSelectedFile}
							onBack={() => setActiveProject(null)}
						/>
					</div>
					<div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
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
					<div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
						<div className="flex items-center gap-2">
							<WorktreeSelector
								projectId={activeProject.id}
								activeWorktreePath={activeWorktreePath}
								mainRepoPath={activeProject.path}
								onWorktreeChange={refreshStatus}
							/>
							<BranchSelector
								projectId={activeProject.id}
								currentBranch={status?.branch ?? ""}
								onBranchChange={refreshStatus}
							/>
							<button
								type="button"
								onClick={() => setViewMode("single")}
								title="Single file"
								className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
									viewMode === "single"
										? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-white"
										: "text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
								}`}
							>
								<FileText size={14} />
							</button>
							<button
								type="button"
								onClick={() => setViewMode("all")}
								title="All changes"
								className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
									viewMode === "all"
										? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-white"
										: "text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
								}`}
							>
								<FileStack size={14} />
							</button>
							<button
								type="button"
								onClick={() => setDiffStyle("unified")}
								title="Stacked"
								className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
									diffStyle === "unified"
										? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-white"
										: "text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
								}`}
							>
								<Rows3 size={14} />
							</button>
							<button
								type="button"
								onClick={() => setDiffStyle("split")}
								title="Side by side"
								className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
									diffStyle === "split"
										? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-white"
										: "text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
								}`}
							>
								<Columns size={14} />
							</button>
						</div>
						<button
							type="button"
							onClick={() => setShowSettings(true)}
							className="rounded p-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
							title="Settings"
						>
							<Settings size={16} />
						</button>
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
						<div className="w-64 shrink-0 flex flex-col border-l border-zinc-200 dark:border-zinc-800">
							<div className="flex border-b border-zinc-200 dark:border-zinc-800">
								<button
									type="button"
									onClick={() => setRightTab("log")}
									className={`flex-1 px-2 py-2 text-xs ${
										rightTab === "log"
											? "border-b-2 border-zinc-800 font-medium dark:border-zinc-400"
											: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
									}`}
								>
									<History size={14} className="mx-auto" />
								</button>
								<button
									type="button"
									onClick={() => setRightTab("stash")}
									className={`flex-1 px-2 py-2 text-xs ${
										rightTab === "stash"
											? "border-b-2 border-zinc-800 font-medium dark:border-zinc-400"
											: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
									}`}
								>
									<Archive size={14} className="mx-auto" />
								</button>
								<button
									type="button"
									onClick={() => setRightTab("remote")}
									className={`flex-1 px-2 py-2 text-xs ${
										rightTab === "remote"
											? "border-b-2 border-zinc-800 font-medium dark:border-zinc-400"
											: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
									}`}
								>
									<Cloud size={14} className="mx-auto" />
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-auto">
								{rightTab === "log" && <LogPanel projectId={activeProject.id} />}
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

function SettingsPanel({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
	const [gitPath, setGitPath] = useState<string | null>(null);
	const [gitBinaries, setGitBinaries] = useState<string[]>([]);
	const [signCommits, setSignCommits] = useState(false);
	const [signingFormat, setSigningFormat] = useState<"ssh" | "gpg">("ssh");
	const [signingKey, setSigningKey] = useState("");
	const [use1PasswordAgent, setUse1PasswordAgent] = useState(false);
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
			setSigningFormat(s.signing?.format ?? "ssh");
			setSigningKey(s.signing?.key ?? "");
			setUse1PasswordAgent(s.signing?.use1PasswordAgent ?? false);
		});
		window.gitagen.settings.discoverGitBinaries().then(setGitBinaries);
		window.gitagen.settings.getSshAgentInfo().then(setSshAgentInfo);
		loadEffectiveConfig();
	}, [loadEffectiveConfig]);

	useEffect(() => {
		window.gitagen.settings.getSshAgentInfo().then(setSshAgentInfo);
	}, [use1PasswordAgent]);

	const updateSigningSettings = async (
		partial: Partial<{
			enabled: boolean;
			format: "ssh" | "gpg";
			key: string;
			use1PasswordAgent: boolean;
		}>
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
		const result = await window.gitagen.repo.testSigning(projectId, signingFormat, signingKey);
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
			await window.gitagen.repo.setLocalConfig(projectId, "gpg.format", signingFormat);
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
				className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 dark:text-zinc-100"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="mb-4 text-lg font-semibold">Settings</h2>
				<div className="space-y-5">
					<div>
						<label className="mb-1 block text-sm font-medium">Git binary</label>
						<div className="flex gap-2">
							<select
								value={gitPath ?? ""}
								onChange={(e) => handleGitBinaryChange(e.target.value)}
								className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
								className="rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
							>
								Browse
							</button>
						</div>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">SSH agent</label>
						<div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
							<p className="font-medium dark:text-zinc-200">{sshAgentInfo.name}</p>
							{sshAgentInfo.path && (
								<p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
									{sshAgentInfo.path}
								</p>
							)}
						</div>
						<label className="mt-2 flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={use1PasswordAgent}
								onChange={async (e) => {
									const v = e.target.checked;
									setUse1PasswordAgent(v);
									await updateSigningSettings({ use1PasswordAgent: v });
									window.gitagen.settings.getSshAgentInfo().then(setSshAgentInfo);
								}}
								className="rounded"
							/>
							<span className="text-xs">
								Use 1Password SSH Agent (when available)
							</span>
						</label>
					</div>
					<div>
						<label className="mb-1 flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={signCommits}
								onChange={async (e) => {
									const v = e.target.checked;
									setSignCommits(v);
									setLocalSignEnabled(v);
									await updateSigningSettings({ enabled: v });
								}}
								className="rounded"
							/>
							<span className="text-sm font-medium">Sign commits</span>
						</label>
						<div className="mt-2 grid grid-cols-2 gap-3">
							<div>
								<label className="mb-1 block text-xs font-medium">
									Signing format
								</label>
								<select
									value={signingFormat}
									onChange={async (e) => {
										const next = e.target.value as "ssh" | "gpg";
										setSigningFormat(next);
										await updateSigningSettings({ format: next });
									}}
									className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
								>
									<option value="ssh">SSH</option>
									<option value="gpg">GPG</option>
								</select>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium">
									Signing key
								</label>
								<input
									value={signingKey}
									onChange={async (e) => {
										const next = e.target.value;
										setSigningKey(next);
										await updateSigningSettings({ key: next });
									}}
									placeholder="key id or ssh key path"
									className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
								/>
							</div>
						</div>
						<div className="mt-2 flex items-center gap-2">
							<button
								type="button"
								onClick={handleTestSigning}
								disabled={!projectId}
								className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
							>
								Test signing
							</button>
							{signingTestResult && (
								<p
									className={`text-xs ${
										signingTestResult.ok
											? "text-emerald-600 dark:text-emerald-400"
											: "text-red-600 dark:text-red-400"
									}`}
								>
									{signingTestResult.message}
								</p>
							)}
						</div>
					</div>
					<div className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
						<p className="mb-2 text-sm font-medium">Project local git config</p>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="mb-1 block text-xs font-medium">user.name</label>
								<input
									value={localUserName}
									onChange={(e) => setLocalUserName(e.target.value)}
									className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
								/>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium">user.email</label>
								<input
									value={localUserEmail}
									onChange={(e) => setLocalUserEmail(e.target.value)}
									className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
								/>
							</div>
						</div>
						<label className="mt-2 flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={localSignEnabled}
								onChange={(e) => setLocalSignEnabled(e.target.checked)}
								className="rounded"
							/>
							commit.gpgsign (local)
						</label>
						<div className="mt-2 flex items-center gap-2">
							<button
								type="button"
								onClick={handleSaveLocalConfig}
								disabled={!projectId || savingLocalConfig}
								className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
							>
								Apply to repo
							</button>
							{localConfigMessage && (
								<p className="text-xs text-zinc-500 dark:text-zinc-400">
									{localConfigMessage}
								</p>
							)}
						</div>
						<div className="mt-3 max-h-32 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
							{effectiveConfig.length === 0 ? (
								<p className="text-xs text-zinc-500 dark:text-zinc-400">
									No effective config entries found.
								</p>
							) : (
								effectiveConfig.slice(-20).map((entry, idx) => (
									<div key={`${entry.key}-${idx}`} className="mb-1 text-[10px]">
										<span className="font-medium">{entry.key}</span>
										<span className="text-zinc-500 dark:text-zinc-400">
											{" "}
											= {entry.value} ({entry.scope}, {entry.origin})
										</span>
									</div>
								))
							)}
						</div>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">Theme</label>
						<div className="flex gap-2">
							{(["light", "dark", "system"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setTheme(t)}
									className={`rounded px-3 py-2 text-sm capitalize ${
										theme === t
											? "bg-zinc-700 text-white dark:bg-zinc-600"
											: "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
									}`}
								>
									{t}
								</button>
							))}
						</div>
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="mt-6 w-full rounded bg-zinc-200 py-2 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
				>
					Close
				</button>
			</div>
		</div>
	);
}

export default function App() {
	const [initialTheme, setInitialTheme] = useState<"dark" | "light" | "system">("system");

	useEffect(() => {
		window.gitagen?.settings
			?.getGlobal?.()
			.then((s) => {
				if (s?.theme) setInitialTheme(s.theme);
			})
			.catch(() => {});
	}, []);

	return (
		<ThemeProvider initialTheme={initialTheme}>
			<AppContent />
		</ThemeProvider>
	);
}
