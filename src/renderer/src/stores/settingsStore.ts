import { create } from "zustand";
import type { FontFamily } from "../../../shared/types";
import { useUIStore } from "./uiStore";

const FONT_STACKS: Record<string, { sans: string; mono: string }> = {
	geist: {
		sans: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
		mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
	"geist-pixel": {
		sans: "'Geist Pixel', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
		mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
	system: {
		sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
		mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
};

export interface SettingsState {
	uiScale: number;
	fontSize: number;
	commitMessageFontSize: number;
	fontFamily: FontFamily;
	devMode: boolean;
	autoExpandSingleFolder: boolean;
	showWorktreePanel: boolean;

	updateSettings: (partial: Partial<SettingsState>) => Promise<void>;
	loadSettings: () => Promise<void>;
	applyToDOM: () => void;
}

const defaultSettings: Omit<SettingsState, "updateSettings" | "loadSettings" | "applyToDOM"> = {
	uiScale: 1.0,
	fontSize: 15,
	commitMessageFontSize: 15,
	fontFamily: "system",
	devMode: false,
	autoExpandSingleFolder: true,
	showWorktreePanel: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
	...defaultSettings,

	updateSettings: async (partial) => {
		set((s) => ({ ...s, ...partial }));
		await window.gitagen?.settings?.setGlobal?.(partial);
		get().applyToDOM();
	},

	loadSettings: async () => {
		const s = await window.gitagen?.settings?.getGlobal?.();
		const loaded = {
			uiScale: s?.uiScale ?? 1.0,
			fontSize: s?.fontSize ?? 14,
			commitMessageFontSize: s?.commitMessageFontSize ?? 14,
			fontFamily: (s?.fontFamily ?? "system") as FontFamily,
			devMode: s?.devMode ?? false,
			autoExpandSingleFolder: s?.autoExpandSingleFolder ?? true,
			showWorktreePanel: s?.showWorktreePanel ?? true,
		};
		set(loaded);
		get().applyToDOM();
		useUIStore.getState().setIsWorktreePanelCollapsed(!loaded.showWorktreePanel);
	},

	applyToDOM: () => {
		const { uiScale, fontSize, commitMessageFontSize, fontFamily } = get();
		document.documentElement.style.setProperty("--ui-scale", String(uiScale));
		document.documentElement.style.setProperty("--base-font-size", `${fontSize}px`);
		document.documentElement.style.setProperty(
			"--commit-message-font-size",
			`${commitMessageFontSize}px`
		);
		const fonts = FONT_STACKS[fontFamily] ?? {
			sans: `"${fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
			mono: `"${fontFamily}", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`,
		};
		document.documentElement.style.setProperty("--font-sans", fonts.sans);
		document.documentElement.style.setProperty("--font-mono", fonts.mono);
	},
}));
