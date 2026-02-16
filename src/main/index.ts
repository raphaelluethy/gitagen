import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { getGitStatus, getFileDiff } from "./git.js";

function createWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			contextIsolation: true,
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
	ipcMain.handle("git:getStatus", async (_, cwd?: string) => {
		const repoPath = cwd ?? process.cwd();
		return getGitStatus(repoPath);
	});

	ipcMain.handle(
		"git:getFileDiff",
		async (_, cwd: string, filePath: string, mode: "staged" | "unstaged" | "untracked") => {
			return getFileDiff(cwd, filePath, mode);
		}
	);

	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
