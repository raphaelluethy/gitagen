import { app, BrowserWindow, dialog, Menu, nativeImage } from "electron";
import { randomUUID } from "crypto";
import { join, resolve } from "path";
import { closeDb, getDb } from "./services/cache/sqlite.js";
import { runRetention } from "./services/cache/retention.js";
import {
	getProjectByPath,
	getProjectPrefs,
	insertProject,
	listProjects,
	setLogCache,
	setProjectPrefs,
} from "./services/cache/queries.js";
import { getAppSettings, setAppSettings } from "./services/settings/store.js";
import { validateGitBinary, ensureSshAuthSock, createGitProvider } from "./services/git/index.js";
import { registerProjectsHandlers } from "./ipc/projects.js";
import { registerSettingsHandlers } from "./ipc/settings.js";
import { registerRepoHandlers } from "./ipc/repo.js";
import { registerEventsHandlers } from "./ipc/events.js";
import { registerCliHandlers, installCli, uninstallCli } from "./ipc/cli.js";

const OPEN_REPO_ARG = "--open-repo";
const EVENT_OPEN_REPO = "events:openRepo";

function parseOpenRepoArg(argv: string[]): string | null {
	const idx = argv.indexOf(OPEN_REPO_ARG);
	if (idx === -1 || idx + 1 >= argv.length) return null;
	return argv[idx + 1] ?? null;
}

async function handleOpenRepo(path: string, win: BrowserWindow): Promise<void> {
	const resolvedPath = resolve(path);
	const existing = getProjectByPath(resolvedPath);
	if (existing) {
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: existing.id,
			worktreePath: undefined,
		});
		win.show();
		win.focus();
		return;
	}
	const provider = createGitProvider(getAppSettings());
	const worktrees = await provider.listWorktrees(resolvedPath);
	const mainWorktree = worktrees.find((w) => w.isMainWorktree);
	const mainPath = mainWorktree ? resolve(mainWorktree.path) : resolvedPath;
	const parentProject = mainPath !== resolvedPath ? getProjectByPath(mainPath) : null;
	if (parentProject) {
		setProjectPrefs(parentProject.id, { activeWorktreePath: resolvedPath });
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: parentProject.id,
			worktreePath: resolvedPath,
		});
	} else {
		const id = randomUUID();
		const now = Math.floor(Date.now() / 1000);
		const name = resolvedPath.split("/").filter(Boolean).pop() || "repo";
		insertProject(id, name, resolvedPath, now, now);
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: id,
			worktreePath: undefined,
		});
	}
	win.show();
	win.focus();
}

// GPU acceleration must be configured before app is ready
{
	getDb();
	const settings = getAppSettings();
	if (!settings.gpuAcceleration) {
		app.disableHardwareAcceleration();
	}
}

const RETENTION_INTERVAL_MS = 30 * 60 * 1000;
const PRELOAD_PROJECT_COUNT = 5;
const PRELOAD_COMMIT_LIMIT = 10;
let retentionInterval: NodeJS.Timeout | null = null;

async function preloadRecentProjectLogs(): Promise<void> {
	const projects = listProjects().slice(0, PRELOAD_PROJECT_COUNT);
	if (projects.length === 0) return;
	const provider = createGitProvider(getAppSettings());
	for (const project of projects) {
		try {
			const prefs = getProjectPrefs(project.id);
			const cwd = prefs?.active_worktree_path?.trim() || project.path;
			const commits = await provider.getLog(cwd, { limit: PRELOAD_COMMIT_LIMIT });
			const headOid = commits.length > 0 ? commits[0]!.oid : null;
			setLogCache(project.id, JSON.stringify(commits), headOid);
		} catch {
			// Skip projects that fail (deleted repos, broken paths, etc.)
		}
	}
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
	app.quit();
	process.exit(0);
}

app.on("second-instance", (_event, commandLine) => {
	const path = parseOpenRepoArg(commandLine);
	const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
	if (win && !win.isDestroyed()) {
		if (path) {
			void handleOpenRepo(path, win);
		} else {
			win.show();
			win.focus();
		}
	}
});

function getIconPath(): string {
	return app.isPackaged
		? join(process.resourcesPath, "icon.png")
		: join(__dirname, "../../resources/icon.png");
}

function createWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		icon: getIconPath(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.NODE_ENV === "development" || !app.isPackaged) {
		win.loadURL(process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173");
	} else {
		win.loadFile(join(__dirname, "../renderer/index.html"));
	}

	return win;
}

function buildAppMenu(): void {
	if (process.platform !== "darwin") return;
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" as const },
				{ type: "separator" as const },
				{
					label: "Install Command Line Tool...",
					click: () => {
						installCli().then((r) => {
							if (!r.ok) {
								dialog.showErrorBox("CLI Install", r.error ?? "Unknown error");
							}
						});
					},
				},
				{
					label: "Uninstall Command Line Tool...",
					click: () => {
						uninstallCli().then((r) => {
							if (!r.ok) {
								dialog.showErrorBox("CLI Uninstall", r.error ?? "Unknown error");
							}
						});
					},
				},
				{ type: "separator" as const },
				{ role: "services" as const },
				{ type: "separator" as const },
				{ role: "hide" as const },
				{ role: "hideOthers" as const },
				{ role: "unhide" as const },
				{ type: "separator" as const },
				{ role: "quit" as const },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" as const },
				{ role: "redo" as const },
				{ type: "separator" as const },
				{ role: "cut" as const },
				{ role: "copy" as const },
				{ role: "paste" as const },
				{ role: "selectAll" as const },
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
	ensureSshAuthSock();
	getDb();

	if (process.platform === "darwin" && app.dock) {
		const dockIcon = nativeImage.createFromPath(getIconPath());
		app.dock.setIcon(dockIcon);
	}

	const appSettings = getAppSettings();
	if (appSettings.gitBinaryPath && !validateGitBinary(appSettings.gitBinaryPath)) {
		setAppSettings({ gitBinaryPath: null });
	}

	registerProjectsHandlers();
	registerSettingsHandlers();
	registerRepoHandlers();
	registerEventsHandlers();
	registerCliHandlers();

	buildAppMenu();

	const win = createWindow();
	const openPath = parseOpenRepoArg(process.argv);
	if (openPath) {
		void handleOpenRepo(openPath, win);
	}

	// Run cache retention and preload commit history after the window is created
	// so startup stays responsive.
	setTimeout(() => {
		runRetention();
		retentionInterval = setInterval(runRetention, RETENTION_INTERVAL_MS);
		retentionInterval.unref();
		void preloadRecentProjectLogs();
	}, 0);

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
	if (retentionInterval) {
		clearInterval(retentionInterval);
		retentionInterval = null;
	}
	closeDb();
});
