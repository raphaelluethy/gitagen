import { ipcMain, dialog } from "electron";
import { getAppSettings, setAppSettings } from "../services/settings/store.js";
import { validateGitBinary, discoverGitBinaries, getSshAgentInfo } from "../services/git/index.js";
import {
	getProjectPrefs,
	setProjectPrefs,
	type ProjectPrefsRow,
} from "../services/cache/queries.js";
import type { AppSettings, ProjectPrefs } from "../../shared/types.js";

function prefsRowToPrefs(row: ProjectPrefsRow): ProjectPrefs {
	return {
		includeIgnored: Boolean(row.include_ignored),
		changedOnly: Boolean(row.changed_only),
		expandedDirs: JSON.parse(row.expanded_dirs || "[]"),
		selectedFilePath: row.selected_file_path,
		sidebarScrollTop: row.sidebar_scroll_top,
		activeWorktreePath: row.active_worktree_path ?? null,
	};
}

export function registerSettingsHandlers(): void {
	ipcMain.handle("settings:getGlobal", async (): Promise<AppSettings> => {
		return getAppSettings();
	});

	ipcMain.handle(
		"settings:setGlobal",
		async (_, partial: Partial<AppSettings>): Promise<AppSettings> => {
			return setAppSettings(partial);
		}
	);

	ipcMain.handle(
		"settings:getProjectPrefs",
		async (_, projectId: string): Promise<ProjectPrefs | null> => {
			const row = getProjectPrefs(projectId);
			return row ? prefsRowToPrefs(row) : null;
		}
	);

	ipcMain.handle(
		"settings:setProjectPrefs",
		async (_, projectId: string, prefs: Partial<ProjectPrefs>): Promise<void> => {
			setProjectPrefs(projectId, prefs);
		}
	);

	ipcMain.handle("settings:selectFolder", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog({
			title: "Select Project Folder",
			properties: ["openDirectory"],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	});

	ipcMain.handle("settings:discoverGitBinaries", async (): Promise<string[]> => {
		return discoverGitBinaries();
	});

	ipcMain.handle(
		"settings:getSshAgentInfo",
		async (): Promise<{ name: string; path: string | null }> => {
			const s = getAppSettings();
			return getSshAgentInfo(s.signing?.use1PasswordAgent ?? false);
		}
	);

	ipcMain.handle("settings:selectGitBinary", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog({
			title: "Select Git Binary",
			properties: ["openFile"],
			filters: [{ name: "Executable", extensions: [] }],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		const path = result.filePaths[0];
		if (validateGitBinary(path)) {
			setAppSettings({ gitBinaryPath: path });
			return path;
		}
		return null;
	});
}
