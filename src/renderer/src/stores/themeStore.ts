import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

interface ThemeState {
	theme: Theme;
	resolved: "dark" | "light";

	setTheme: (t: Theme) => void;
	setResolved: (r: "dark" | "light") => void;
	loadTheme: () => Promise<void>;
}

function getSystemTheme(): "dark" | "light" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): "dark" | "light" {
	return theme === "system" ? getSystemTheme() : theme;
}

export const useThemeStore = create<ThemeState>((set, _get) => ({
	theme: "system",
	resolved: getSystemTheme(),

	setTheme: (t) => {
		set({ theme: t, resolved: resolveTheme(t) });
		window.gitagen?.settings?.setGlobal?.({ theme: t });
	},

	setResolved: (r) => set({ resolved: r }),

	loadTheme: async () => {
		const s = await window.gitagen?.settings?.getGlobal?.();
		const theme = (s?.theme ?? "system") as Theme;
		set({ theme, resolved: resolveTheme(theme) });
	},
}));
