import { getAppSetting, setAppSetting } from "../cache/queries.js";
import type { AppSettings, AIProviderInstance } from "../../../shared/types.js";
import { setAIApiKey, getAllAIApiKeys } from "./keychain.js";

export async function getAppSettingsWithKeys(): Promise<AppSettings> {
	const settings = getAppSettings();
	const apiKeys = await getAllAIApiKeys();

	settings.ai.providers = settings.ai.providers.map((p) => ({
		...p,
		apiKey: apiKeys[p.id] ?? "",
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
	uiScale: "uiScale",
	fontSize: "fontSize",
	commitMessageFontSize: "commitMessageFontSize",
	fontFamily: "fontFamily",
	gpuAcceleration: "gpuAcceleration",
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
	},
	uiScale: 1.0,
	fontSize: 14,
	commitMessageFontSize: 14,
	fontFamily: "system",
	gpuAcceleration: true,
};

export function getAppSettings(): AppSettings {
	const gitBinaryPathRaw = getAppSetting(KEYS.gitBinaryPath);
	const gitBinaryPath =
		gitBinaryPathRaw === "" || gitBinaryPathRaw === undefined ? null : gitBinaryPathRaw;

	const themeRaw = getAppSetting(KEYS.theme);
	const theme = (
		themeRaw === "dark" || themeRaw === "light" || themeRaw === "system" ? themeRaw : "system"
	) as AppSettings["theme"];

	const signingEnabled = getAppSetting(KEYS.signingEnabled) === "true";
	const signingKey = getAppSetting(KEYS.signingKey) ?? DEFAULTS.signing.key;

	const aiProvidersRaw = getAppSetting(KEYS.aiProviders);
	const aiActiveProvider = getAppSetting(KEYS.aiActiveProvider) ?? null;

	let aiProviders: AIProviderInstance[] = [];
	if (aiProvidersRaw) {
		try {
			aiProviders = JSON.parse(aiProvidersRaw);
		} catch {
			aiProviders = [];
		}
	}

	const uiScaleRaw = getAppSetting(KEYS.uiScale);
	const uiScale = uiScaleRaw ? parseFloat(uiScaleRaw) : DEFAULTS.uiScale;

	const fontSizeRaw = getAppSetting(KEYS.fontSize);
	const fontSize = fontSizeRaw ? parseInt(fontSizeRaw, 10) : DEFAULTS.fontSize;

	const commitMessageFontSizeRaw = getAppSetting(KEYS.commitMessageFontSize);
	const commitMessageFontSize = commitMessageFontSizeRaw
		? parseInt(commitMessageFontSizeRaw, 10)
		: DEFAULTS.commitMessageFontSize;

	const fontFamilyRaw = getAppSetting(KEYS.fontFamily);
	const fontFamily = (
		fontFamilyRaw === "geist" || fontFamilyRaw === "geist-pixel" || fontFamilyRaw === "system"
			? fontFamilyRaw
			: DEFAULTS.fontFamily
	) as AppSettings["fontFamily"];

	const gpuAccelerationRaw = getAppSetting(KEYS.gpuAcceleration);
	const gpuAcceleration = gpuAccelerationRaw === "false" ? false : DEFAULTS.gpuAcceleration;

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
		},
		uiScale,
		fontSize,
		commitMessageFontSize,
		fontFamily,
		gpuAcceleration,
	};
}

export async function setAppSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
	if (partial.gitBinaryPath !== undefined) {
		setAppSetting(KEYS.gitBinaryPath, partial.gitBinaryPath);
	}
	if (partial.theme !== undefined) {
		setAppSetting(KEYS.theme, partial.theme);
	}
	if (partial.signing !== undefined) {
		if (partial.signing.enabled !== undefined) {
			setAppSetting(KEYS.signingEnabled, partial.signing.enabled ? "true" : "false");
		}
		if (partial.signing.key !== undefined) {
			setAppSetting(KEYS.signingKey, partial.signing.key);
		}
	}
	if (partial.ai !== undefined) {
		if (partial.ai.activeProviderId !== undefined) {
			setAppSetting(KEYS.aiActiveProvider, partial.ai.activeProviderId ?? "");
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
			setAppSetting(KEYS.aiProviders, JSON.stringify(providersWithoutKeys));
		}
	}
	if (partial.uiScale !== undefined) {
		setAppSetting(KEYS.uiScale, String(partial.uiScale));
	}
	if (partial.fontSize !== undefined) {
		setAppSetting(KEYS.fontSize, String(partial.fontSize));
	}
	if (partial.commitMessageFontSize !== undefined) {
		setAppSetting(KEYS.commitMessageFontSize, String(partial.commitMessageFontSize));
	}
	if (partial.fontFamily !== undefined) {
		setAppSetting(KEYS.fontFamily, partial.fontFamily);
	}
	if (partial.gpuAcceleration !== undefined) {
		setAppSetting(KEYS.gpuAcceleration, partial.gpuAcceleration ? "true" : "false");
	}

	return getAppSettings();
}
