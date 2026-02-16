import { app, BrowserWindow } from "electron";
import { join } from "path";
import { closeDb, getDb } from "./services/cache/sqlite.js";
import { runRetention } from "./services/cache/retention.js";
import { getAppSettings, setAppSettings } from "./services/settings/store.js";
import { validateGitBinary } from "./services/git/index.js";
import { registerProjectsHandlers } from "./ipc/projects.js";
import { registerSettingsHandlers } from "./ipc/settings.js";
import { registerRepoHandlers } from "./ipc/repo.js";
import { registerEventsHandlers } from "./ipc/events.js";

const RETENTION_INTERVAL_MS = 30 * 60 * 1000;
let retentionInterval: NodeJS.Timeout | null = null;

function createWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.NODE_ENV === "development" || !app.isPackaged) {
		win.loadURL(process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173");
		win.webContents.openDevTools();
	} else {
		win.loadFile(join(__dirname, "../renderer/index.html"));
	}

	return win;
}

app.whenReady().then(() => {
	// Initialize DB and run retention
	getDb();

	const appSettings = getAppSettings();
	if (appSettings.gitBinaryPath && !validateGitBinary(appSettings.gitBinaryPath)) {
		setAppSettings({ gitBinaryPath: null });
	}

	runRetention();
	retentionInterval = setInterval(runRetention, RETENTION_INTERVAL_MS);
	retentionInterval.unref();

	registerProjectsHandlers();
	registerSettingsHandlers();
	registerRepoHandlers();
	registerEventsHandlers();

	createWindow();

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
