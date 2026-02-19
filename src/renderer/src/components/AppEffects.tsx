import { useEffect } from "react";
import type { ConflictState } from "../../../shared/types";
import { useProjectStore } from "../stores/projectStore";
import { useRepoStore } from "../stores/repoStore";
import { useUIStore } from "../stores/uiStore";
import { useThemeStore } from "../stores/themeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "../toast/provider";

/** Handles window focus/blur, IPC events, theme DOM sync, and settings initialization. */
export function AppEffects() {
	const { toast } = useToast();
	const activeProject = useProjectStore((s) => s.activeProject);
	const theme = useThemeStore((s) => s.theme);
	const resolved = useThemeStore((s) => s.resolved);

	// Load projects and settings on mount
	useEffect(() => {
		useProjectStore.getState().loadProjects();
		useSettingsStore.getState().loadSettings();
		useThemeStore.getState().loadTheme();
	}, []);

	// Open project when activeProject changes
	useEffect(() => {
		useRepoStore.getState().clearState();
		useUIStore.getState().clearSelectionOnProjectChange();
		if (!activeProject) return;
		void useRepoStore.getState().openProject(activeProject.id);
	}, [activeProject?.id]);

	// Window focus/blur: refresh status, trigger diff reload, watch/unwatch
	useEffect(() => {
		if (!activeProject) return;

		const startWatching = () => {
			window.gitagen.repo.watchProject(activeProject.id);
		};

		const stopWatching = () => {
			window.gitagen.repo.unwatchProject(activeProject.id);
		};

		const handleFocus = () => {
			void window.gitagen.repo.refresh(activeProject.id);
			useRepoStore.getState().triggerRefresh();
			void useRepoStore.getState().refreshStatus();
			startWatching();
		};

		const handleBlur = () => {
			stopWatching();
		};

		if (document.hasFocus()) {
			startWatching();
		}

		window.addEventListener("focus", handleFocus);
		window.addEventListener("blur", handleBlur);

		return () => {
			stopWatching();
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("blur", handleBlur);
		};
	}, [activeProject?.id]);

	// IPC event subscriptions
	useEffect(() => {
		const unsubscribeUpdated = window.gitagen.events.onRepoUpdated(
			(payload: { projectId: string; updatedAt: number }) => {
				if (!activeProject || payload.projectId !== activeProject.id) return;
				void useRepoStore.getState().refreshStatus();
			}
		);
		const unsubscribeConflicts = window.gitagen.events.onConflictDetected(
			(payload: { projectId: string; state: ConflictState }) => {
				if (!activeProject || payload.projectId !== activeProject.id) return;
				void useRepoStore.getState().refreshStatus();
			}
		);
		const unsubscribeErrors = window.gitagen.events.onRepoError(
			(payload: { projectId: string | null; message: string; name: string }) => {
				if (!activeProject) return;
				if (payload.projectId && payload.projectId !== activeProject.id) return;
				toast.error(payload.name, payload.message);
			}
		);
		return () => {
			unsubscribeUpdated();
			unsubscribeConflicts();
			unsubscribeErrors();
		};
	}, [activeProject?.id, toast]);

	// Theme DOM sync: toggle dark class and handle system preference
	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolved === "dark");
	}, [resolved]);

	useEffect(() => {
		if (theme !== "system") return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const next = mql.matches ? "dark" : "light";
			if (useThemeStore.getState().resolved !== next) {
				useThemeStore.getState().setResolved(next);
			}
		};
		mql.addEventListener("change", handler);
		// Defer initial sync to avoid store update during effect commit (prevents infinite loop)
		queueMicrotask(handler);
		return () => mql.removeEventListener("change", handler);
	}, [theme]);

	return null;
}
