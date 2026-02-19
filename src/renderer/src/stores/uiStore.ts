import { create } from "zustand";
import type { DiffStyle } from "../../../shared/types";
import type { RightPanelTab, SettingsTab, ViewMode } from "../hooks/useCommandRegistry";

interface UIState {
	diffStyle: DiffStyle;
	viewMode: ViewMode;
	showSettings: boolean;
	showGitAgent: boolean;
	gitAgentInitialPrompt: string | undefined;
	rightTab: RightPanelTab;
	selectedCommitOid: string | null;
	selectedStashIndex: number | null;
	showStashDialog: boolean;
	stashRefreshKey: number;
	isRightPanelCollapsed: boolean;
	isLeftPanelCollapsed: boolean;
	isCommandPaletteOpen: boolean;
	settingsTabOverride: SettingsTab | null;
	isWorktreePanelCollapsed: boolean;

	setDiffStyle: (style: DiffStyle) => void;
	setViewMode: (mode: ViewMode) => void;
	setRightTab: (tab: RightPanelTab) => void;
	openSettings: (tab?: SettingsTab) => void;
	closeSettings: () => void;
	openGitAgent: (prompt?: string) => void;
	closeGitAgent: () => void;
	toggleLeftPanel: () => void;
	toggleRightPanel: () => void;
	toggleWorktreePanel: () => void;
	openCommandPalette: () => void;
	closeCommandPalette: () => void;
	setSelectedCommitOid: (oid: string | null) => void;
	setSelectedStashIndex: (index: number | null) => void;
	showStashDialogOpen: () => void;
	showStashDialogClose: () => void;
	incrementStashRefreshKey: () => void;
	setIsRightPanelCollapsed: (collapsed: boolean) => void;
	setIsLeftPanelCollapsed: (collapsed: boolean) => void;
	setIsWorktreePanelCollapsed: (collapsed: boolean) => void;
	clearSelectionOnProjectChange: () => void;
}

export const useUIStore = create<UIState>((set) => ({
	diffStyle: "unified",
	viewMode: "single",
	showSettings: false,
	showGitAgent: false,
	gitAgentInitialPrompt: undefined,
	rightTab: "log",
	selectedCommitOid: null,
	selectedStashIndex: null,
	showStashDialog: false,
	stashRefreshKey: 0,
	isRightPanelCollapsed: false,
	isLeftPanelCollapsed: false,
	isCommandPaletteOpen: false,
	settingsTabOverride: null,
	isWorktreePanelCollapsed: false,

	setDiffStyle: (style) => set({ diffStyle: style }),
	setViewMode: (mode) => set({ viewMode: mode }),
	setRightTab: (tab) => set({ rightTab: tab }),
	openSettings: (tab) =>
		set({
			showSettings: true,
			settingsTabOverride: tab ?? null,
			selectedCommitOid: null,
		}),
	closeSettings: () =>
		set({
			showSettings: false,
			settingsTabOverride: null,
		}),
	openGitAgent: (prompt) =>
		set({
			showGitAgent: true,
			gitAgentInitialPrompt: prompt,
		}),
	closeGitAgent: () =>
		set({
			showGitAgent: false,
			gitAgentInitialPrompt: undefined,
		}),
	toggleLeftPanel: () => set((s) => ({ isLeftPanelCollapsed: !s.isLeftPanelCollapsed })),
	toggleRightPanel: () => set((s) => ({ isRightPanelCollapsed: !s.isRightPanelCollapsed })),
	toggleWorktreePanel: () =>
		set((s) => ({ isWorktreePanelCollapsed: !s.isWorktreePanelCollapsed })),
	openCommandPalette: () => set({ isCommandPaletteOpen: true }),
	closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
	setSelectedCommitOid: (oid) => set({ selectedCommitOid: oid }),
	setSelectedStashIndex: (index) => set({ selectedStashIndex: index }),
	showStashDialogOpen: () => set({ showStashDialog: true }),
	showStashDialogClose: () => set({ showStashDialog: false }),
	incrementStashRefreshKey: () => set((s) => ({ stashRefreshKey: s.stashRefreshKey + 1 })),
	setIsRightPanelCollapsed: (collapsed) => set({ isRightPanelCollapsed: collapsed }),
	setIsLeftPanelCollapsed: (collapsed) => set({ isLeftPanelCollapsed: collapsed }),
	setIsWorktreePanelCollapsed: (collapsed) => set({ isWorktreePanelCollapsed: collapsed }),
	clearSelectionOnProjectChange: () =>
		set({
			selectedCommitOid: null,
			selectedStashIndex: null,
		}),
}));
