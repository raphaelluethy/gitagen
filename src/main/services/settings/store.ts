import { getAppSetting, setAppSetting } from "../cache/queries.js";
import type { AppSettings } from "../../../shared/types.js";

const KEYS = {
	gitBinaryPath: "gitBinaryPath",
	theme: "theme",
	signingEnabled: "signing.enabled",
	signingFormat: "signing.format",
	signingKey: "signing.key",
	signingUse1Password: "signing.use1PasswordAgent",
} as const;

const DEFAULTS: AppSettings = {
	gitBinaryPath: null,
	theme: "system",
	signing: {
		enabled: false,
		format: "ssh",
		key: "",
		use1PasswordAgent: false,
	},
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
	const signingFormat =
		(getAppSetting(KEYS.signingFormat) as "ssh" | "gpg") || DEFAULTS.signing.format;
	const signingKey = getAppSetting(KEYS.signingKey) ?? DEFAULTS.signing.key;
	const signingUse1Password = getAppSetting(KEYS.signingUse1Password) === "true";

	return {
		gitBinaryPath,
		theme,
		signing: {
			enabled: signingEnabled,
			format: signingFormat,
			key: signingKey,
			use1PasswordAgent: signingUse1Password,
		},
	};
}

export function setAppSettings(partial: Partial<AppSettings>): AppSettings {
	const current = getAppSettings();

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
		if (partial.signing.format !== undefined) {
			setAppSetting(KEYS.signingFormat, partial.signing.format);
		}
		if (partial.signing.key !== undefined) {
			setAppSetting(KEYS.signingKey, partial.signing.key);
		}
		if (partial.signing.use1PasswordAgent !== undefined) {
			setAppSetting(
				KEYS.signingUse1Password,
				partial.signing.use1PasswordAgent ? "true" : "false"
			);
		}
	}

	return getAppSettings();
}
