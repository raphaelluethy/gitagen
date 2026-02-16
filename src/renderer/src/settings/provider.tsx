import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface Settings {
	uiScale: number;
	fontSize: number;
	commitMessageFontSize: number;
}

interface SettingsContextValue {
	settings: Settings;
	updateSettings: (partial: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
	uiScale: 1.0,
	fontSize: 14,
	commitMessageFontSize: 14,
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
