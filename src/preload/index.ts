import { contextBridge, ipcRenderer } from "electron";
import type { GitStatus } from "../shared/types.js";

export const api = {
	getStatus: (cwd?: string): Promise<GitStatus | null> => ipcRenderer.invoke("git:getStatus", cwd),

	getFileDiff: (
		cwd: string,
		filePath: string,
		mode: "staged" | "unstaged" | "untracked"
	): Promise<string | null> => ipcRenderer.invoke("git:getFileDiff", cwd, filePath, mode),
};

export type Api = typeof api;

declare global {
	interface Window {
		api: Api;
	}
}

contextBridge.exposeInMainWorld("api", api);
