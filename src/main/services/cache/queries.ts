import { getDb } from "./sqlite.js";

export function getAppSetting(key: string): string | null {
	const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
		| { value: string }
		| undefined;
	return row?.value ?? null;
}

export function setAppSetting(key: string, value: string | null): void {
	getDb()
		.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
		.run(key, value);
}

export interface ProjectRow {
	id: string;
	name: string;
	path: string;
	last_opened_at: number;
	created_at: number;
}

export function listProjects(): ProjectRow[] {
	return getDb()
		.prepare(
			"SELECT id, name, path, last_opened_at, created_at FROM projects ORDER BY last_opened_at DESC"
		)
		.all() as ProjectRow[];
}

export function getProject(id: string): ProjectRow | null {
	const row = getDb()
		.prepare("SELECT id, name, path, last_opened_at, created_at FROM projects WHERE id = ?")
		.get(id) as ProjectRow | undefined;
	return row ?? null;
}

export function getProjectByPath(path: string): ProjectRow | null {
	const row = getDb()
		.prepare("SELECT id, name, path, last_opened_at, created_at FROM projects WHERE path = ?")
		.get(path) as ProjectRow | undefined;
	return row ?? null;
}

export function insertProject(
	id: string,
	name: string,
	path: string,
	lastOpenedAt: number,
	createdAt: number
): void {
	getDb()
		.prepare(
			"INSERT INTO projects (id, name, path, last_opened_at, created_at) VALUES (?, ?, ?, ?, ?)"
		)
		.run(id, name, path, lastOpenedAt, createdAt);
}

export function updateProjectLastOpened(id: string, lastOpenedAt: number): void {
	getDb().prepare("UPDATE projects SET last_opened_at = ? WHERE id = ?").run(lastOpenedAt, id);
}

export function deleteProject(id: string): void {
	getDb().prepare("DELETE FROM project_prefs WHERE project_id = ?").run(id);
	getDb().prepare("DELETE FROM repo_cache WHERE project_id = ?").run(id);
	getDb().prepare("DELETE FROM patch_cache WHERE project_id = ?").run(id);
	getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export interface ProjectPrefsRow {
	include_ignored: number;
	changed_only: number;
	expanded_dirs: string;
	selected_file_path: string | null;
	sidebar_scroll_top: number;
	active_worktree_path: string | null;
}

export function getProjectPrefs(projectId: string): ProjectPrefsRow | null {
	const row = getDb()
		.prepare(
			"SELECT include_ignored, changed_only, expanded_dirs, selected_file_path, sidebar_scroll_top, active_worktree_path FROM project_prefs WHERE project_id = ?"
		)
		.get(projectId) as ProjectPrefsRow | undefined;
	return row ?? null;
}

export function setProjectPrefs(
	projectId: string,
	prefs: {
		includeIgnored?: boolean;
		changedOnly?: boolean;
		expandedDirs?: string[];
		selectedFilePath?: string | null;
		sidebarScrollTop?: number;
		activeWorktreePath?: string | null;
	}
): void {
	const existing = getProjectPrefs(projectId);
	const includeIgnored =
		prefs.includeIgnored ?? (existing ? Boolean(existing.include_ignored) : false);
	const changedOnly = prefs.changedOnly ?? (existing ? Boolean(existing.changed_only) : false);
	const expandedDirs = prefs.expandedDirs ?? (existing ? JSON.parse(existing.expanded_dirs) : []);
	const selectedFilePath = prefs.selectedFilePath ?? existing?.selected_file_path ?? null;
	const sidebarScrollTop = prefs.sidebarScrollTop ?? existing?.sidebar_scroll_top ?? 0;
	const activeWorktreePath =
		prefs.activeWorktreePath !== undefined
			? prefs.activeWorktreePath
			: (existing?.active_worktree_path ?? null);

	getDb()
		.prepare(
			`INSERT INTO project_prefs (project_id, include_ignored, changed_only, expanded_dirs, selected_file_path, sidebar_scroll_top, active_worktree_path)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(project_id) DO UPDATE SET
			   include_ignored = excluded.include_ignored,
			   changed_only = excluded.changed_only,
			   expanded_dirs = excluded.expanded_dirs,
			   selected_file_path = excluded.selected_file_path,
			   sidebar_scroll_top = excluded.sidebar_scroll_top,
			   active_worktree_path = excluded.active_worktree_path`
		)
		.run(
			projectId,
			includeIgnored ? 1 : 0,
			changedOnly ? 1 : 0,
			JSON.stringify(expandedDirs),
			selectedFilePath,
			sidebarScrollTop,
			activeWorktreePath
		);
}

export interface RepoCacheRow {
	tree_data: string | null;
	status_data: string | null;
	size_bytes: number | null;
}

export function getRepoCache(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean
): RepoCacheRow | null {
	const row = getDb()
		.prepare(
			"SELECT tree_data, status_data, size_bytes FROM repo_cache WHERE project_id = ? AND fingerprint = ? AND include_ignored = ?"
		)
		.get(projectId, fingerprint, includeIgnored ? 1 : 0) as RepoCacheRow | undefined;
	if (!row) return null;
	// Touch accessed_at
	getDb()
		.prepare(
			"UPDATE repo_cache SET accessed_at = unixepoch() WHERE project_id = ? AND fingerprint = ? AND include_ignored = ?"
		)
		.run(projectId, fingerprint, includeIgnored ? 1 : 0);
	return row;
}

export function setRepoCache(
	projectId: string,
	fingerprint: string,
	includeIgnored: boolean,
	treeData: string | null,
	statusData: string | null
): void {
	const sizeBytes = (treeData?.length ?? 0) + (statusData?.length ?? 0);
	const now = Math.floor(Date.now() / 1000);
	getDb()
		.prepare(
			`INSERT INTO repo_cache (project_id, fingerprint, include_ignored, tree_data, status_data, size_bytes, accessed_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(project_id, fingerprint, include_ignored) DO UPDATE SET
			   tree_data = excluded.tree_data,
			   status_data = excluded.status_data,
			   size_bytes = excluded.size_bytes,
			   accessed_at = excluded.accessed_at`
		)
		.run(
			projectId,
			fingerprint,
			includeIgnored ? 1 : 0,
			treeData,
			statusData,
			sizeBytes,
			now,
			now
		);
}

export function getPatchCache(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string
): string | null {
	const row = getDb()
		.prepare(
			"SELECT patch_text FROM patch_cache WHERE project_id = ? AND file_path = ? AND scope = ? AND fingerprint = ?"
		)
		.get(projectId, filePath, scope, fingerprint) as { patch_text: string } | undefined;
	if (!row) return null;
	getDb()
		.prepare(
			"UPDATE patch_cache SET accessed_at = unixepoch() WHERE project_id = ? AND file_path = ? AND scope = ? AND fingerprint = ?"
		)
		.run(projectId, filePath, scope, fingerprint);
	return row.patch_text;
}

export function setPatchCache(
	projectId: string,
	filePath: string,
	scope: string,
	fingerprint: string,
	patchText: string
): void {
	const sizeBytes = patchText.length;
	const now = Math.floor(Date.now() / 1000);
	getDb()
		.prepare(
			`INSERT INTO patch_cache (project_id, file_path, scope, fingerprint, patch_text, size_bytes, accessed_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(project_id, file_path, scope, fingerprint) DO UPDATE SET
			   patch_text = excluded.patch_text,
			   size_bytes = excluded.size_bytes,
			   accessed_at = excluded.accessed_at`
		)
		.run(projectId, filePath, scope, fingerprint, patchText, sizeBytes, now, now);
}

export function invalidateProjectCache(projectId: string): void {
	getDb().prepare("DELETE FROM repo_cache WHERE project_id = ?").run(projectId);
	getDb().prepare("DELETE FROM patch_cache WHERE project_id = ?").run(projectId);
}
