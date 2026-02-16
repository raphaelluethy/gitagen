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
const TOPLEVEL_CACHE_TTL_MS = 5 * 60 * 1000;
const TOPLEVEL_CONCURRENCY = 8;
const GROUPING_GIT_PROBE_LIMIT = 5;
const toplevelCache = new Map<string, { value: string | null; fetchedAt: number }>();

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

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	if (items.length === 0) return [];
	const results = Array.from({ length: items.length }) as R[];
	let nextIndex = 0;
	const worker = async () => {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await mapper(items[index], index);
		}
	};
	const workerCount = Math.min(limit, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

async function getToplevelCached(
	projectPath: string,
	provider: ReturnType<typeof createGitProvider>
): Promise<string | null> {
	const now = Date.now();
	const cacheKey = normalizePath(projectPath);
	const cached = toplevelCache.get(cacheKey);
	if (cached && now - cached.fetchedAt < TOPLEVEL_CACHE_TTL_MS) {
		return cached.value;
	}
	const toplevel = await provider.getToplevel(projectPath);
	const normalized = toplevel ? normalizePath(toplevel) : null;
	toplevelCache.set(cacheKey, { value: normalized, fetchedAt: now });
	return normalized;
}

export function registerProjectsHandlers(): void {
	ipcMain.handle("projects:list", async (): Promise<Project[]> => {
		const rows = await dbListProjects();
		return rows.map(rowToProject);
	});

	ipcMain.handle("projects:listGrouped", async (): Promise<GroupedProject[]> => {
		const rows = await dbListProjects();
		const projects = rows.map(rowToProject);
		const provider = createGitProvider(await getAppSettings());
		const projectsToProbe = projects.slice(0, GROUPING_GIT_PROBE_LIMIT);

		const toplevelEntries = await mapWithConcurrency(
			projectsToProbe,
			TOPLEVEL_CONCURRENCY,
			async (p) => ({ id: p.id, toplevel: await getToplevelCached(p.path, provider) })
		);
		const toplevelByProjectId = new Map<string, string>();
		for (const entry of toplevelEntries) {
			if (entry.toplevel) {
				toplevelByProjectId.set(entry.id, entry.toplevel);
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
		const existing = await getProjectByPath(path);
		if (existing) return rowToProject(existing);
		const id = randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await insertProject(id, name, path, now, now);
		return rowToProject((await getProject(id))!);
	});

	ipcMain.handle("projects:remove", async (_, projectId: string): Promise<void> => {
		const project = await getProject(projectId);
		await deleteProject(projectId);
		if (!project || !isManagedWorktreePath(project.path)) return;
		try {
			await removeWorktreeManager(
				project.path,
				project.path,
				createGitProvider(await getAppSettings()),
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
		const project = await getProject(projectId);
		if (!project) return null;
		const now = Math.floor(Date.now() / 1000);
		await updateProjectLastOpened(projectId, now);
		return rowToProject({ ...project, last_opened_at: now });
	});
}
