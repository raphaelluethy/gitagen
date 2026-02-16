import { ipcMain, dialog } from "electron";
import {
	getAppSettings,
	setAppSettings,
	getAppSettingsWithKeys,
} from "../services/settings/store.js";
import { validateGitBinary, discoverGitBinaries, getSshAgentInfo } from "../services/git/index.js";
import {
	getProjectPrefs,
	setProjectPrefs,
} from "../services/cache/queries.js";
import { prefsRowToPrefs } from "../services/cache/utils.js";
import { fetchModelsFromProvider, type FetchModelsResult } from "../services/ai/models.js";
import { getAllProviders } from "../services/ai/index.js";
import type {
	AppSettings,
	ProjectPrefs,
	AIProviderType,
	AIProviderDescriptor,
} from "../../shared/types.js";

export function registerSettingsHandlers(): void {
	ipcMain.handle("settings:getGlobal", async (): Promise<AppSettings> => {
		return await getAppSettings();
	});

	ipcMain.handle("settings:getGlobalWithKeys", async (): Promise<AppSettings> => {
		return getAppSettingsWithKeys();
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
			const row = await getProjectPrefs(projectId);
			return row ? prefsRowToPrefs(row) : null;
		}
	);

	ipcMain.handle(
		"settings:setProjectPrefs",
		async (_, projectId: string, prefs: Partial<ProjectPrefs>): Promise<void> => {
			await setProjectPrefs(projectId, prefs);
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
			return getSshAgentInfo();
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
			await setAppSettings({ gitBinaryPath: path });
			return path;
		}
		return null;
	});

const VALID_PROVIDER_TYPES: AIProviderType[] = [
	"openai",
	"anthropic",
	"openrouter",
	"cerebras",
	"fireworks",
	"openai-compatible",
];

function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function isValidProviderType(type: string): type is AIProviderType {
	return VALID_PROVIDER_TYPES.includes(type as AIProviderType);
}

	ipcMain.handle(
		"settings:fetchModels",
		async (
			_,
			type: AIProviderType,
			apiKey: string,
			baseURL?: string
		): Promise<FetchModelsResult> => {
			if (!isValidProviderType(type)) {
				return { success: false, models: [], error: "Invalid provider type" };
			}
			if (baseURL !== undefined && baseURL !== "" && !isValidUrl(baseURL)) {
				return { success: false, models: [], error: "Invalid base URL: must be http or https" };
			}
			return fetchModelsFromProvider(type, apiKey, baseURL);
		}
	);

	ipcMain.handle("settings:listAIProviders", async (): Promise<AIProviderDescriptor[]> => {
		return getAllProviders().map((provider) => ({
			id: provider.id,
			displayName: provider.displayName,
			requiresBaseURL: provider.requiresBaseURL,
		}));
	});
}
