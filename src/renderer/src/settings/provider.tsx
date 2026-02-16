import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { FontFamily } from "../../../shared/types";

interface Settings {
	uiScale: number;
	fontSize: number;
	commitMessageFontSize: number;
	fontFamily: FontFamily;
	devMode: boolean;
	autoExpandSingleFolder: boolean;
	showWorktreePanel: boolean;
}

interface SettingsContextValue {
	settings: Settings;
	updateSettings: (partial: Partial<Settings>) => void;
}

const FONT_STACKS: Record<string, { sans: string; mono: string }> = {
	geist: {
		sans: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
		mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	},
	"geist-pixel": {
		sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
		mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
	system: {
		sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
		mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
};

const defaultSettings: Settings = {
	uiScale: 1.0,
	fontSize: 14,
	commitMessageFontSize: 14,
	fontFamily: "system",
	devMode: false,
	autoExpandSingleFolder: true,
	showWorktreePanel: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
	children,
	initialSettings,
}: {
	children: ReactNode;
	initialSettings?: Partial<Settings>;
}) {
	const [settings, setSettingsState] = useState<Settings>({
		...defaultSettings,
		...initialSettings,
	});

	useEffect(() => {
		if (initialSettings) {
			setSettingsState((prev) => ({ ...prev, ...initialSettings }));
		}
	}, [initialSettings]);

	// Apply settings to CSS variables
	useEffect(() => {
		document.documentElement.style.setProperty("--ui-scale", String(settings.uiScale));
		document.documentElement.style.setProperty("--base-font-size", `${settings.fontSize}px`);
		document.documentElement.style.setProperty(
			"--commit-message-font-size",
			`${settings.commitMessageFontSize}px`
		);
		const fonts = FONT_STACKS[settings.fontFamily] ?? {
			sans: `"${settings.fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
			mono: `"${settings.fontFamily}", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`,
		};
		document.documentElement.style.setProperty("--font-sans", fonts.sans);
		document.documentElement.style.setProperty("--font-mono", fonts.mono);
	}, [settings]);

	const updateSettings = async (partial: Partial<Settings>) => {
		const newSettings = { ...settings, ...partial };
		setSettingsState(newSettings);
		await window.gitagen?.settings?.setGlobal?.(partial);
	};

	return (
		<SettingsContext.Provider value={{ settings, updateSettings }}>
			{children}
		</SettingsContext.Provider>
	);
}

export function useSettings(): SettingsContextValue {
	const ctx = useContext(SettingsContext);
	if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
	return ctx;
}
