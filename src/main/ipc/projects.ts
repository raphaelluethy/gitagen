import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import {
	listProjects as dbListProjects,
	getProject,
	getProjectByPath,
	insertProject,
	updateProjectLastOpened,
	deleteProject,
	type ProjectRow,
} from "../services/cache/queries.js";
import type { Project } from "../../shared/types.js";

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		path: row.path,
		lastOpenedAt: row.last_opened_at,
		createdAt: row.created_at,
	};
}

export function registerProjectsHandlers(): void {
	ipcMain.handle("projects:list", async (): Promise<Project[]> => {
		const rows = dbListProjects();
		return rows.map(rowToProject);
	});

	ipcMain.handle("projects:add", async (_, name: string, path: string): Promise<Project> => {
		const existing = getProjectByPath(path);
		if (existing) return rowToProject(existing);
		const id = randomUUID();
		const now = Math.floor(Date.now() / 1000);
		insertProject(id, name, path, now, now);
		return rowToProject(getProject(id)!);
	});

	ipcMain.handle("projects:remove", async (_, projectId: string): Promise<void> => {
		deleteProject(projectId);
	});

	ipcMain.handle("projects:switchTo", async (_, projectId: string): Promise<Project | null> => {
		const project = getProject(projectId);
		if (!project) return null;
		const now = Math.floor(Date.now() / 1000);
		updateProjectLastOpened(projectId, now);
		return rowToProject({ ...project, last_opened_at: now });
	});
}
