import { create } from "zustand";
import type { Project } from "../../../shared/types";

const LAST_PROJECT_KEY = "gitagen:lastProjectId";

interface ProjectState {
	projects: Project[];
	activeProject: Project | null;
	loading: boolean;
	projectLoading: boolean;

	loadProjects: () => Promise<void>;
	setActiveProject: (project: Project | null) => void;
	addProject: () => Promise<void>;
	removeProject: (projectId: string) => Promise<void>;
	setProjectLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
	projects: [],
	activeProject: null,
	loading: true,
	projectLoading: false,

	loadProjects: async () => {
		const list = (await window.gitagen.projects.list()) as Project[];
		set({ projects: list, loading: false });
		const lastId =
			typeof localStorage !== "undefined" ? localStorage.getItem(LAST_PROJECT_KEY) : null;
		if (lastId && list.some((p) => p.id === lastId)) {
			const project = list.find((p) => p.id === lastId) ?? null;
			if (project) set({ activeProject: project });
		}
	},

	setActiveProject: (project) => {
		set({ activeProject: project });
		if (project) {
			try {
				localStorage.setItem(LAST_PROJECT_KEY, project.id);
			} catch {
				// ignore localStorage quota / privacy errors
			}
		}
	},

	addProject: async () => {
		const path: string | null = await window.gitagen.settings.selectFolder();
		if (!path) return;
		const name = path.split("/").filter(Boolean).pop() || "repo";
		const p = await window.gitagen.projects.add(name, path);
		set((state) => ({
			projects: [p, ...state.projects],
			activeProject: p,
		}));
	},

	removeProject: async (projectId) => {
		await window.gitagen.projects.remove(projectId);
		const { activeProject } = get();
		set((state) => ({
			projects: state.projects.filter((p) => p.id !== projectId),
			activeProject: activeProject?.id === projectId ? null : activeProject,
		}));
	},

	setProjectLoading: (loading) => set({ projectLoading: loading }),
}));
