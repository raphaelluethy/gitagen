import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
	key: text("key").notNull().primaryKey(),
	value: text("value"),
});

export const projects = sqliteTable(
	"projects",
	{
		id: text("id").notNull().primaryKey(),
		name: text("name").notNull(),
		path: text("path").notNull().unique(),
		lastOpenedAt: integer("last_opened_at").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [index("idx_projects_last_opened").on(table.lastOpenedAt)]
);

export const projectPrefs = sqliteTable("project_prefs", {
	projectId: text("project_id")
		.notNull()
		.primaryKey()
		.references(() => projects.id),
	includeIgnored: integer("include_ignored").notNull().default(0),
	changedOnly: integer("changed_only").notNull().default(0),
	expandedDirs: text("expanded_dirs").notNull().default("[]"),
	selectedFilePath: text("selected_file_path"),
	sidebarScrollTop: integer("sidebar_scroll_top").notNull().default(0),
	activeWorktreePath: text("active_worktree_path"),
});

export const repoCache = sqliteTable(
	"repo_cache",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		fingerprint: text("fingerprint").notNull(),
		includeIgnored: integer("include_ignored").notNull(),
		treeData: text("tree_data"),
		statusData: text("status_data"),
		sizeBytes: integer("size_bytes"),
		accessedAt: integer("accessed_at").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("repo_cache_project_fingerprint_ignored").on(
			table.projectId,
			table.fingerprint,
			table.includeIgnored
		),
		index("idx_repo_cache_project").on(table.projectId),
		index("idx_repo_cache_accessed").on(table.accessedAt),
	]
);

export const patchCache = sqliteTable(
	"patch_cache",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		filePath: text("file_path").notNull(),
		scope: text("scope").notNull(),
		fingerprint: text("fingerprint").notNull(),
		patchText: text("patch_text").notNull(),
		sizeBytes: integer("size_bytes"),
		accessedAt: integer("accessed_at").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("patch_cache_project_file_scope_fingerprint").on(
			table.projectId,
			table.filePath,
			table.scope,
			table.fingerprint
		),
		index("idx_patch_cache_project").on(table.projectId),
		index("idx_patch_cache_accessed").on(table.accessedAt),
	]
);

export const logCache = sqliteTable("log_cache", {
	projectId: text("project_id")
		.notNull()
		.primaryKey()
		.references(() => projects.id),
	commitsJson: text("commits_json").notNull(),
	headOid: text("head_oid"),
	unpushedOidsJson: text("unpushed_oids_json"),
	updatedAt: integer("updated_at").notNull(),
});
