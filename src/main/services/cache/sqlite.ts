import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";

const SCHEMA_VERSION = 3;

let db: Database.Database | null = null;

function getDbPath(): string {
	return join(app.getPath("userData"), "gitagen.db");
}

function initCoreSchema(database: Database.Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS schema_version (
			version INTEGER NOT NULL PRIMARY KEY,
			applied_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
	`);
}

function initSchema(database: Database.Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT NOT NULL PRIMARY KEY,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS projects (
			id TEXT NOT NULL PRIMARY KEY,
			name TEXT NOT NULL,
			path TEXT NOT NULL UNIQUE,
			last_opened_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS project_prefs (
			project_id TEXT NOT NULL PRIMARY KEY REFERENCES projects(id),
			include_ignored INTEGER NOT NULL DEFAULT 0,
			changed_only INTEGER NOT NULL DEFAULT 0,
			expanded_dirs TEXT NOT NULL DEFAULT '[]',
			selected_file_path TEXT,
			sidebar_scroll_top INTEGER NOT NULL DEFAULT 0,
			active_worktree_path TEXT
		);

		CREATE TABLE IF NOT EXISTS repo_cache (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL REFERENCES projects(id),
			fingerprint TEXT NOT NULL,
			include_ignored INTEGER NOT NULL,
			tree_data TEXT,
			status_data TEXT,
			size_bytes INTEGER,
			accessed_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			UNIQUE(project_id, fingerprint, include_ignored)
		);
		CREATE INDEX IF NOT EXISTS idx_repo_cache_project ON repo_cache(project_id);
		CREATE INDEX IF NOT EXISTS idx_repo_cache_accessed ON repo_cache(accessed_at);

		CREATE TABLE IF NOT EXISTS patch_cache (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL REFERENCES projects(id),
			file_path TEXT NOT NULL,
			scope TEXT NOT NULL,
			fingerprint TEXT NOT NULL,
			patch_text TEXT NOT NULL,
			size_bytes INTEGER,
			accessed_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			UNIQUE(project_id, file_path, scope, fingerprint)
		);
		CREATE INDEX IF NOT EXISTS idx_patch_cache_project ON patch_cache(project_id);
		CREATE INDEX IF NOT EXISTS idx_patch_cache_accessed ON patch_cache(accessed_at);
	`);
}

function runMigrations(database: Database.Database): void {
	const row = database.prepare("SELECT MAX(version) as v FROM schema_version").get() as {
		v: number | null;
	};
	const current = row?.v ?? 0;

	if (current < SCHEMA_VERSION) {
		for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
			if (v === 2) {
				try {
					database
						.prepare("ALTER TABLE project_prefs ADD COLUMN active_worktree_path TEXT")
						.run();
				} catch {
					// Column may exist
				}
			}
			if (v === 3) {
				// Recreate tables with new columns
				database.exec(`
					DROP TABLE IF EXISTS repo_cache;
					DROP TABLE IF EXISTS patch_cache;
					DROP TABLE IF EXISTS project_prefs;
				`);
			}
			database.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(v);
		}
	}
}

export function getDb(): Database.Database {
	if (!db) {
		const path = getDbPath();
		db = new Database(path);
		db.pragma("journal_mode = WAL");
		initCoreSchema(db);
		runMigrations(db);
		initSchema(db);
	}
	return db;
}

export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}
