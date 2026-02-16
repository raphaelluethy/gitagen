/// <reference types="vite/client" />

declare global {
	interface Window {
		gitagen: {
			projects: {
				list: () => Promise<import("../../shared/types").Project[]>;
				add: (name: string, path: string) => Promise<import("../../shared/types").Project>;
				remove: (projectId: string) => Promise<void>;
				switchTo: (
					projectId: string
				) => Promise<import("../../shared/types").Project | null>;
			};
			repo: Record<string, unknown>;
			settings: {
				getGlobal: () => Promise<import("../../shared/types").AppSettings>;
				getGlobalWithKeys: () => Promise<import("../../shared/types").AppSettings>;
				setGlobal: (
					partial: Partial<import("../../shared/types").AppSettings>
				) => Promise<import("../../shared/types").AppSettings>;
				getProjectPrefs: (
					projectId: string
				) => Promise<import("../../shared/types").ProjectPrefs | null>;
				setProjectPrefs: (
					projectId: string,
					prefs: Partial<import("../../shared/types").ProjectPrefs>
				) => Promise<void>;
				fetchModels: (
					type: string,
					apiKey: string,
					baseURL?: string
				) => Promise<{ success: boolean; models: string[]; error?: string }>;
				listAIProviders: () => Promise<import("../../shared/types").AIProviderDescriptor[]>;
				selectGitBinary: () => Promise<string | null>;
				selectFolder: () => Promise<string | null>;
			};
			events: Record<string, unknown>;
		};
	}
}
