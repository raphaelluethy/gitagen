import { app, BrowserWindow, dialog, Menu, nativeImage, session } from "electron";
import { randomUUID } from "crypto";
import { join, resolve } from "path";
import { updateElectronApp } from "update-electron-app";
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
	const existing = await getProjectByPath(resolvedPath);
	if (existing) {
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: existing.id,
			worktreePath: undefined,
		});
		win.show();
		win.focus();
		return;
	}
	const provider = createGitProvider(await getAppSettings());
	const worktrees = await provider.listWorktrees(resolvedPath);
	const mainWorktree = worktrees.find((w) => w.isMainWorktree);
	const mainPath = mainWorktree ? resolve(mainWorktree.path) : resolvedPath;
	const parentProject = mainPath !== resolvedPath ? await getProjectByPath(mainPath) : null;
	if (parentProject) {
		await setProjectPrefs(parentProject.id, { activeWorktreePath: resolvedPath });
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: parentProject.id,
			worktreePath: resolvedPath,
		});
	} else {
		const id = randomUUID();
		const now = Math.floor(Date.now() / 1000);
		const name = resolvedPath.split("/").filter(Boolean).pop() || "repo";
		await insertProject(id, name, resolvedPath, now, now);
		win.webContents.send(EVENT_OPEN_REPO, {
			projectId: id,
			worktreePath: undefined,
		});
	}
	win.show();
	win.focus();
}

// GPU acceleration must be configured before app is ready. Run async init immediately;
// in practice it completes before app.ready fires.
(async () => {
	await getDb();
	const s = await getAppSettings();
	if (!s.gpuAcceleration) app.disableHardwareAcceleration();
})();

const RETENTION_INTERVAL_MS = 30 * 60 * 1000;
const PRELOAD_PROJECT_COUNT = 5;
const PRELOAD_COMMIT_LIMIT = 10;
let retentionInterval: NodeJS.Timeout | null = null;

async function preloadRecentProjectLogs(): Promise<void> {
	const allProjects = await listProjects();
	const projects = allProjects.slice(0, PRELOAD_PROJECT_COUNT);
	if (projects.length === 0) return;
	const provider = createGitProvider(await getAppSettings());
	await Promise.allSettled(
		projects.map(async (project) => {
			const prefs = await getProjectPrefs(project.id);
			const cwd = prefs?.active_worktree_path?.trim() || project.path;
			const [commits, unpushed] = await Promise.all([
				provider.getLog(cwd, { limit: PRELOAD_COMMIT_LIMIT }),
				provider.getUnpushedOids(cwd),
			]);
			const headOid = commits.length > 0 ? commits[0]!.oid : null;
			const unpushedJson = unpushed && unpushed.length > 0 ? JSON.stringify(unpushed) : null;
			await setLogCache(project.id, JSON.stringify(commits), headOid, unpushedJson);
		})
	);
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const singleInstanceLock = isDev ? true : app.requestSingleInstanceLock();
if (!singleInstanceLock) {
	app.quit();
}

app.on("second-instance", (_event, commandLine) => {
	const path = parseOpenRepoArg(commandLine);
	const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
	if (win && !win.isDestroyed()) {
		if (path) {
			void handleOpenRepo(path, win).catch((error) => {
				console.error("[handleOpenRepo] Failed to open repo:", error);
			});
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
			webSecurity: true,
			allowRunningInsecureContent: false,
		},
	});

	win.webContents.on("will-navigate", (event, url) => {
		const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
		const allowedPrefix = isDev
			? (process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173")
			: `file://${join(__dirname, "../renderer")}`;
		if (!url.startsWith(allowedPrefix)) {
			event.preventDefault();
		}
	});

	win.webContents.setWindowOpenHandler(() => {
		return { action: "deny" };
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

app.whenReady().then(async () => {
	ensureSshAuthSock();
	await getDb();

	const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
	const cspDirectives = [
		"default-src 'self'",
		isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' data: https://fonts.gstatic.com",
		"img-src 'self' data:",
		isDev
			? "connect-src 'self' ws://localhost:* http://localhost:* https: wss:"
			: "connect-src 'self' https: wss:",
	];
	const csp = cspDirectives.join("; ");
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [csp],
			},
		});
	});

	if (process.platform === "darwin" && app.dock) {
		const dockIcon = nativeImage.createFromPath(getIconPath());
		app.dock.setIcon(dockIcon);
	}

	const appSettings = await getAppSettings();
	if (appSettings.gitBinaryPath && !validateGitBinary(appSettings.gitBinaryPath)) {
		await setAppSettings({ gitBinaryPath: null });
	}

	registerProjectsHandlers();
	registerSettingsHandlers();
	registerRepoHandlers();
	registerEventsHandlers();
	registerCliHandlers();

	buildAppMenu();

	// TODO: re-enable once Apple Developer signing is set up
	// if (app.isPackaged) {
	// 	updateElectronApp();
	// }

	const win = createWindow();
	const openPath = parseOpenRepoArg(process.argv);
	if (openPath) {
		void handleOpenRepo(openPath, win).catch((error) => {
			console.error("[handleOpenRepo] Failed to open repo:", error);
		});
	}

	setTimeout(() => {
		void runRetention().catch((error) => {
			console.error("[runRetention] Cache retention failed:", error);
		});
		retentionInterval = setInterval(() => {
			void runRetention().catch((error) => {
				console.error("[runRetention] Cache retention failed:", error);
			});
		}, RETENTION_INTERVAL_MS);
		retentionInterval.unref();
		void preloadRecentProjectLogs().catch((error) => {
			console.error("[preloadRecentProjectLogs] Preload failed:", error);
		});
	}, 0);

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("quit", async () => {
	if (retentionInterval) {
		clearInterval(retentionInterval);
		retentionInterval = null;
	}
	try {
		await closeDb();
	} catch (error) {
		console.error("[closeDb] Failed to close database:", error);
	}
});

function gracefulShutdown(): void {
	if (retentionInterval) {
		clearInterval(retentionInterval);
		retentionInterval = null;
	}
	closeDb()
		.catch(() => {})
		.finally(() => {
			app.quit();
		});
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
