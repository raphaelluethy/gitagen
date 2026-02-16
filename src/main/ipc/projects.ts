import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import { rmSync } from "fs";
import { homedir } from "os";
import { resolve, sep } from "path";
import {
	listProjects as dbListProjects,
	getProject,
	getProjectByPath,
	insertProject,
	updateProjectLastOpened,
	deleteProject,
	type ProjectRow,
} from "../services/cache/queries.js";
import { createGitProvider } from "../services/git/index.js";
import { getAppSettings } from "../services/settings/store.js";
import { removeWorktree as removeWorktreeManager } from "../services/worktree/manager.js";
import type { GroupedProject, Project } from "../../shared/types.js";

const GITAGEN_DIR = resolve(homedir(), ".gitagen");

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		path: row.path,
		lastOpenedAt: row.last_opened_at,
		createdAt: row.created_at,
	};
}

function normalizePath(p: string): string {
	return resolve(p);
}

function isManagedWorktreePath(p: string): boolean {
	const resolved = resolve(p);
	return resolved === GITAGEN_DIR || resolved.startsWith(`${GITAGEN_DIR}${sep}`);
}

export function registerProjectsHandlers(): void {
	ipcMain.handle("projects:list", async (): Promise<Project[]> => {
		const rows = dbListProjects();
		return rows.map(rowToProject);
	});

	ipcMain.handle("projects:listGrouped", async (): Promise<GroupedProject[]> => {
		const rows = dbListProjects();
		const projects = rows.map(rowToProject);
		const provider = createGitProvider(getAppSettings());

		const toplevelEntries = await Promise.all(
			projects.map(async (p) => ({ id: p.id, toplevel: await provider.getToplevel(p.path) }))
		);
		const toplevelByProjectId = new Map<string, string>();
		for (const entry of toplevelEntries) {
			if (entry.toplevel) {
				toplevelByProjectId.set(entry.id, normalizePath(entry.toplevel));
			}
		}

		const pathToProjectId = new Map<string, string>();
		for (const p of projects) {
			pathToProjectId.set(normalizePath(p.path), p.id);
		}

		const grouped: GroupedProject[] = projects.map((p) => {
			const toplevel = toplevelByProjectId.get(p.id);
			const myPath = normalizePath(p.path);
			const result: GroupedProject = { ...p };

			if (toplevel && toplevel !== myPath) {
				const parentId = pathToProjectId.get(toplevel);
				if (parentId) result.parentProjectId = parentId;
			}
			return result;
		});

		for (const g of grouped) {
			const children = grouped.filter((c) => c.parentProjectId === g.id);
			if (children.length > 0) {
				g.worktreeChildren = children;
			}
		}

		return grouped;
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
		const project = getProject(projectId);
		deleteProject(projectId);
		if (!project || !isManagedWorktreePath(project.path)) return;
		try {
			await removeWorktreeManager(
				project.path,
				project.path,
				createGitProvider(getAppSettings()),
				true
			);
		} catch {
			// Best-effort cleanup; fall through to direct removal.
		}
		try {
			rmSync(project.path, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	ipcMain.handle("projects:switchTo", async (_, projectId: string): Promise<Project | null> => {
		const project = getProject(projectId);
		if (!project) return null;
		const now = Math.floor(Date.now() / 1000);
		updateProjectLastOpened(projectId, now);
		return rowToProject({ ...project, last_opened_at: now });
	});
}
