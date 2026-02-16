import { getAppSetting, setAppSetting } from "../cache/queries.js";
import type { AppSettings, AIProviderInstance, CommitStyle } from "../../../shared/types.js";
import { setAIApiKey, getAllAIApiKeys } from "./keychain.js";

function maskApiKey(key: string): string {
	if (!key || key.length < 8) return key ? "***" : "";
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function getAppSettingsWithKeys(): Promise<AppSettings> {
	const settings = await getAppSettings();
	const apiKeys = await getAllAIApiKeys();

	settings.ai.providers = settings.ai.providers.map((p) => ({
		...p,
		apiKey: apiKeys[p.id] ?? "",
	}));

	return settings;
}

export async function getAppSettingsForRenderer(): Promise<AppSettings> {
	const settings = await getAppSettings();
	const apiKeys = await getAllAIApiKeys();

	settings.ai.providers = settings.ai.providers.map((p) => ({
		...p,
		apiKey: maskApiKey(apiKeys[p.id] ?? ""),
	}));

	return settings;
}

const KEYS = {
	gitBinaryPath: "gitBinaryPath",
	theme: "theme",
	signingEnabled: "signing.enabled",
	signingKey: "signing.key",
	aiProviders: "ai.providers",
	aiActiveProvider: "ai.activeProviderId",
	aiCommitStyle: "ai.commitStyle",
	uiScale: "uiScale",
	fontSize: "fontSize",
	commitMessageFontSize: "commitMessageFontSize",
	fontFamily: "fontFamily",
	gpuAcceleration: "gpuAcceleration",
	devMode: "devMode",
	autoExpandSingleFolder: "sidebar.autoExpandSingleFolder",
	showWorktreePanel: "sidebar.showWorktreePanel",
} as const;

const DEFAULTS: AppSettings = {
	gitBinaryPath: null,
	theme: "system",
	signing: {
		enabled: false,
		key: "",
	},
	ai: {
		activeProviderId: null,
		providers: [],
		commitStyle: "conventional",
	},
	uiScale: 1.0,
	fontSize: 14,
	commitMessageFontSize: 14,
	fontFamily: "system",
	gpuAcceleration: true,
	devMode: false,
	autoExpandSingleFolder: true,
	showWorktreePanel: true,
};

export async function getAppSettings(): Promise<AppSettings> {
	const [
		gitBinaryPathRaw,
		themeRaw,
		signingEnabledRaw,
		signingKeyRaw,
		aiProvidersRaw,
		aiActiveProviderRaw,
		aiCommitStyleRaw,
		uiScaleRaw,
		fontSizeRaw,
		commitMessageFontSizeRaw,
		fontFamilyRaw,
		gpuAccelerationRaw,
		devModeRaw,
		autoExpandSingleFolderRaw,
		showWorktreePanelRaw,
	] = await Promise.all([
		getAppSetting(KEYS.gitBinaryPath),
		getAppSetting(KEYS.theme),
		getAppSetting(KEYS.signingEnabled),
		getAppSetting(KEYS.signingKey),
		getAppSetting(KEYS.aiProviders),
		getAppSetting(KEYS.aiActiveProvider),
		getAppSetting(KEYS.aiCommitStyle),
		getAppSetting(KEYS.uiScale),
		getAppSetting(KEYS.fontSize),
		getAppSetting(KEYS.commitMessageFontSize),
		getAppSetting(KEYS.fontFamily),
		getAppSetting(KEYS.gpuAcceleration),
		getAppSetting(KEYS.devMode),
		getAppSetting(KEYS.autoExpandSingleFolder),
		getAppSetting(KEYS.showWorktreePanel),
	]);

	const gitBinaryPath =
		gitBinaryPathRaw === "" || gitBinaryPathRaw === undefined ? null : gitBinaryPathRaw;

	const theme = (
		themeRaw === "dark" || themeRaw === "light" || themeRaw === "system" ? themeRaw : "system"
	) as AppSettings["theme"];

	const signingEnabled = signingEnabledRaw === "true";
	const signingKey = signingKeyRaw ?? DEFAULTS.signing.key;

	let aiProviders: AIProviderInstance[] = [];
	if (aiProvidersRaw) {
		try {
			aiProviders = JSON.parse(aiProvidersRaw);
		} catch {
			aiProviders = [];
		}
	}

	const aiActiveProvider = aiActiveProviderRaw ?? null;

	const commitStyle: CommitStyle =
		aiCommitStyleRaw === "conventional" ||
		aiCommitStyleRaw === "emoji" ||
		aiCommitStyleRaw === "descriptive" ||
		aiCommitStyleRaw === "imperative"
			? aiCommitStyleRaw
			: DEFAULTS.ai.commitStyle;

	const uiScale = uiScaleRaw ? parseFloat(uiScaleRaw) : DEFAULTS.uiScale;

	const fontSize = fontSizeRaw ? parseInt(fontSizeRaw, 10) : DEFAULTS.fontSize;

	const commitMessageFontSize = commitMessageFontSizeRaw
		? parseInt(commitMessageFontSizeRaw, 10)
		: DEFAULTS.commitMessageFontSize;

	const fontFamily = (
		fontFamilyRaw === "geist" ||
		fontFamilyRaw === "geist-pixel" ||
		fontFamilyRaw === "system" ||
		(typeof fontFamilyRaw === "string" && fontFamilyRaw.length > 0)
			? fontFamilyRaw
			: DEFAULTS.fontFamily
	) as AppSettings["fontFamily"];

	const gpuAcceleration = gpuAccelerationRaw === "false" ? false : DEFAULTS.gpuAcceleration;

	const devMode = devModeRaw === "true" ? true : DEFAULTS.devMode;

	const autoExpandSingleFolder =
		autoExpandSingleFolderRaw === "false" ? false : DEFAULTS.autoExpandSingleFolder;

	const showWorktreePanel = showWorktreePanelRaw === "false" ? false : DEFAULTS.showWorktreePanel;

	return {
		gitBinaryPath,
		theme,
		signing: {
			enabled: signingEnabled,
			key: signingKey,
		},
		ai: {
			activeProviderId: aiActiveProvider,
			providers: aiProviders,
			commitStyle,
		},
		uiScale,
		fontSize,
		commitMessageFontSize,
		fontFamily,
		gpuAcceleration,
		devMode,
		autoExpandSingleFolder,
		showWorktreePanel,
	};
}

export async function setAppSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
	if (partial.gitBinaryPath !== undefined) {
		await setAppSetting(KEYS.gitBinaryPath, partial.gitBinaryPath);
	}
	if (partial.theme !== undefined) {
		await setAppSetting(KEYS.theme, partial.theme);
	}
	if (partial.signing !== undefined) {
		if (partial.signing.enabled !== undefined) {
			await setAppSetting(KEYS.signingEnabled, partial.signing.enabled ? "true" : "false");
		}
		if (partial.signing.key !== undefined) {
			await setAppSetting(KEYS.signingKey, partial.signing.key);
		}
	}
	if (partial.ai !== undefined) {
		if (partial.ai.activeProviderId !== undefined) {
			await setAppSetting(KEYS.aiActiveProvider, partial.ai.activeProviderId ?? "");
		}
		if (partial.ai.providers !== undefined) {
			for (const provider of partial.ai.providers) {
				if (provider.apiKey) {
					await setAIApiKey(provider.id, provider.apiKey);
				}
			}
			const providersWithoutKeys = partial.ai.providers.map((p) => ({
				...p,
				apiKey: "",
			}));
			await setAppSetting(KEYS.aiProviders, JSON.stringify(providersWithoutKeys));
		}
		if (partial.ai.commitStyle !== undefined) {
			await setAppSetting(KEYS.aiCommitStyle, partial.ai.commitStyle);
		}
	}
	if (partial.uiScale !== undefined) {
		await setAppSetting(KEYS.uiScale, String(partial.uiScale));
	}
	if (partial.fontSize !== undefined) {
		await setAppSetting(KEYS.fontSize, String(partial.fontSize));
	}
	if (partial.commitMessageFontSize !== undefined) {
		await setAppSetting(KEYS.commitMessageFontSize, String(partial.commitMessageFontSize));
	}
	if (partial.fontFamily !== undefined) {
		await setAppSetting(KEYS.fontFamily, partial.fontFamily);
	}
	if (partial.gpuAcceleration !== undefined) {
		await setAppSetting(KEYS.gpuAcceleration, partial.gpuAcceleration ? "true" : "false");
	}
	if (partial.devMode !== undefined) {
		await setAppSetting(KEYS.devMode, partial.devMode ? "true" : "false");
	}
	if (partial.autoExpandSingleFolder !== undefined) {
		await setAppSetting(
			KEYS.autoExpandSingleFolder,
			partial.autoExpandSingleFolder ? "true" : "false"
		);
	}
	if (partial.showWorktreePanel !== undefined) {
		await setAppSetting(KEYS.showWorktreePanel, partial.showWorktreePanel ? "true" : "false");
	}

	return getAppSettings();
}
