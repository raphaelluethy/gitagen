import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./sqlite.js";
import { appSettings, logCache, patchCache, projectPrefs, projects, repoCache } from "./schema.js";

export async function getAppSetting(key: string): Promise<string | null> {
	const db = await getDb();
	const rows = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, key));
	return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string | null): Promise<void> {
	const db = await getDb();
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value },
	});
}

export interface ProjectRow {
	id: string;
	name: string;
	path: string;
	last_opened_at: number;
	created_at: number;
}

export async function listProjects(): Promise<ProjectRow[]> {
	const db = await getDb();
	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			path: projects.path,
			last_opened_at: projects.lastOpenedAt,
			created_at: projects.createdAt,
		})
		.from(projects)
		.orderBy(desc(projects.lastOpenedAt));
	return rows as ProjectRow[];
}

export async function getProject(id: string): Promise<ProjectRow | null> {
	const db = await getDb();
	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			path: projects.path,
			last_opened_at: projects.lastOpenedAt,
			created_at: projects.createdAt,
		})
		.from(projects)
		.where(eq(projects.id, id));
	return rows[0] ? (rows[0] as ProjectRow) : null;
}

export async function getProjectByPath(path: string): Promise<ProjectRow | null> {
	const db = await getDb();
	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			path: projects.path,
			last_opened_at: projects.lastOpenedAt,
			created_at: projects.createdAt,
		})
		.from(projects)
		.where(eq(projects.path, path));
	return rows[0] ? (rows[0] as ProjectRow) : null;
}

export async function insertProject(
	id: string,
	name: string,
	path: string,
	lastOpenedAt: number,
	createdAt: number
): Promise<void> {
	const db = await getDb();
	await db.insert(projects).values({
		id,
		name,
		path,
		lastOpenedAt,
		createdAt,
	});
}

export async function updateProjectLastOpened(id: string, lastOpenedAt: number): Promise<void> {
	const db = await getDb();
	await db.update(projects).set({ lastOpenedAt }).where(eq(projects.id, id));
}

export async function deleteProject(id: string): Promise<void> {
	const db = await getDb();
	await Promise.all([
		db.delete(projectPrefs).where(eq(projectPrefs.projectId, id)),
		db.delete(repoCache).where(eq(repoCache.projectId, id)),
		db.delete(patchCache).where(eq(patchCache.projectId, id)),
		db.delete(logCache).where(eq(logCache.projectId, id)),
	]);
	await db.delete(projects).where(eq(projects.id, id));
}

export interface ProjectPrefsRow {
	include_ignored: number;
	changed_only: number;
	expanded_dirs: string;
	selected_file_path: string | null;
	sidebar_scroll_top: number;
	active_worktree_path: string | null;
}

export async function getProjectPrefs(projectId: string): Promise<ProjectPrefsRow | null> {
	const db = await getDb();
	const rows = await db
		.select({
			include_ignored: projectPrefs.includeIgnored,
			changed_only: projectPrefs.changedOnly,
			expanded_dirs: projectPrefs.expandedDirs,
			selected_file_path: projectPrefs.selectedFilePath,
			sidebar_scroll_top: projectPrefs.sidebarScrollTop,
			active_worktree_path: projectPrefs.activeWorktreePath,
		})
		.from(projectPrefs)
		.where(eq(projectPrefs.projectId, projectId));
	return rows[0] ? (rows[0] as ProjectPrefsRow) : null;
}

export async function setProjectPrefs(
	projectId: string,
	prefs: {
		includeIgnored?: boolean;
		changedOnly?: boolean;
		expandedDirs?: string[];
		selectedFilePath?: string | null;
		sidebarScrollTop?: number;
		activeWorktreePath?: string | null;
	}
): Promise<void> {
	const db = await getDb();
	await db
		.insert(projectPrefs)
		.values({
			projectId,
			includeIgnored: prefs.includeIgnored !== undefined ? (prefs.includeIgnored ? 1 : 0) : 0,
			changedOnly: prefs.changedOnly !== undefined ? (prefs.changedOnly ? 1 : 0) : 0,
			expandedDirs:
				prefs.expandedDirs !== undefined ? JSON.stringify(prefs.expandedDirs) : "[]",
			selectedFilePath: prefs.selectedFilePath ?? null,
			sidebarScrollTop: prefs.sidebarScrollTop ?? 0,
			activeWorktreePath: prefs.activeWorktreePath ?? null,
		})
		.onConflictDoUpdate({
			target: projectPrefs.projectId,
			set: {
				includeIgnored: sql`COALESCE(${prefs.includeIgnored !== undefined ? (prefs.includeIgnored ? 1 : 0) : null}, include_ignored)`,
				changedOnly: sql`COALESCE(${prefs.changedOnly !== undefined ? (prefs.changedOnly ? 1 : 0) : null}, changed_only)`,
				expandedDirs: sql`COALESCE(${prefs.expandedDirs !== undefined ? JSON.stringify(prefs.expandedDirs) : null}, expanded_dirs)`,
				selectedFilePath: sql`COALESCE(${prefs.selectedFilePath !== undefined ? prefs.selectedFilePath : null}, selected_file_path)`,
				sidebarScrollTop: sql`COALESCE(${prefs.sidebarScrollTop !== undefined ? prefs.sidebarScrollTop : null}, sidebar_scroll_top)`,
				activeWorktreePath: sql`COALESCE(${prefs.activeWorktreePath !== undefined ? prefs.activeWorktreePath : null}, active_worktree_path)`,
			},
		});
}

export interface RepoCacheRow {
	tree_data: string | null;
	status_data: string | null;
	size_bytes: number | null;
}

export async function getRepoCache(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean
): Promise<RepoCacheRow | null> {
	const inc = includeIgnored ? 1 : 0;
	const db = await getDb();
	const rows = await db
		.select({
			tree_data: repoCache.treeData,
			status_data: repoCache.statusData,
			size_bytes: repoCache.sizeBytes,
		})
		.from(repoCache)
		.where(
			and(
				eq(repoCache.projectId, projectId),
				eq(repoCache.fingerprint, fingerprint),
				eq(repoCache.includeIgnored, inc)
			)
		);
	const row = rows[0];
	if (!row) return null;
	return row as RepoCacheRow;
}

export async function setRepoCache(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean,
	treeData: string | null,
	statusData: string | null
): Promise<void> {
	const sizeBytes = (treeData?.length ?? 0) + (statusData?.length ?? 0);
	const now = Math.floor(Date.now() / 1000);
	const db = await getDb();
	await db
		.insert(repoCache)
		.values({
			projectId,
			fingerprint,
			includeIgnored: includeIgnored ? 1 : 0,
			treeData,
			statusData,
			sizeBytes,
			accessedAt: now,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [repoCache.projectId, repoCache.fingerprint, repoCache.includeIgnored],
			set: {
				treeData,
				statusData,
				sizeBytes,
				accessedAt: now,
			},
		});
}

export async function getPatchCache(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string
): Promise<string | null> {
	const db = await getDb();
	const rows = await db
		.select({ patch_text: patchCache.patchText })
		.from(patchCache)
		.where(
			and(
				eq(patchCache.projectId, projectId),
				eq(patchCache.filePath, filePath),
				eq(patchCache.scope, scope),
				eq(patchCache.fingerprint, fingerprint)
			)
		);
	const row = rows[0];
	if (!row) return null;
	return row.patch_text;
}

export async function setPatchCache(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string,
	patchText: string
): Promise<void> {
	const sizeBytes = patchText.length;
	const now = Math.floor(Date.now() / 1000);
	const db = await getDb();
	await db
		.insert(patchCache)
		.values({
			projectId,
			filePath,
			scope,
			fingerprint,
			patchText,
			sizeBytes,
			accessedAt: now,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [
				patchCache.projectId,
				patchCache.filePath,
				patchCache.scope,
				patchCache.fingerprint,
			],
			set: {
				patchText,
				sizeBytes,
				accessedAt: now,
			},
		});
}

export async function invalidateProjectCache(projectId: string): Promise<void> {
	const db = await getDb();
	await db.delete(repoCache).where(eq(repoCache.projectId, projectId));
	await db.delete(patchCache).where(eq(patchCache.projectId, projectId));
}

// --- Log cache ---

export interface LogCacheRow {
	commits_json: string;
	head_oid: string | null;
	unpushed_oids_json: string | null;
	updated_at: number;
}

export async function getLogCache(projectId: string): Promise<LogCacheRow | null> {
	const db = await getDb();
	const rows = await db
		.select({
			commits_json: logCache.commitsJson,
			head_oid: logCache.headOid,
			unpushed_oids_json: logCache.unpushedOidsJson,
			updated_at: logCache.updatedAt,
		})
		.from(logCache)
		.where(eq(logCache.projectId, projectId));
	return rows[0] ? (rows[0] as LogCacheRow) : null;
}

export async function setLogCache(
	projectId: string,
	commitsJson: string,
	headOid: string | null,
	unpushedOidsJson: string | null = null
): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	const db = await getDb();
	await db
		.insert(logCache)
		.values({
			projectId,
			commitsJson,
			headOid,
			unpushedOidsJson,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: logCache.projectId,
			set: {
				commitsJson,
				headOid,
				unpushedOidsJson,
				updatedAt: now,
			},
		});
}

export async function deleteLogCache(projectId: string): Promise<void> {
	const db = await getDb();
	await db.delete(logCache).where(eq(logCache.projectId, projectId));
}
