CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `log_cache` (
	`project_id` text PRIMARY KEY NOT NULL,
	`commits_json` text NOT NULL,
	`head_oid` text,
	`unpushed_oids_json` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patch_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`file_path` text NOT NULL,
	`scope` text NOT NULL,
	`fingerprint` text NOT NULL,
	`patch_text` text NOT NULL,
	`size_bytes` integer,
	`accessed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patch_cache_project_file_scope_fingerprint` ON `patch_cache` (`project_id`,`file_path`,`scope`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_patch_cache_project` ON `patch_cache` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_patch_cache_accessed` ON `patch_cache` (`accessed_at`);--> statement-breakpoint
CREATE TABLE `project_prefs` (
	`project_id` text PRIMARY KEY NOT NULL,
	`include_ignored` integer DEFAULT 0 NOT NULL,
	`changed_only` integer DEFAULT 0 NOT NULL,
	`expanded_dirs` text DEFAULT '[]' NOT NULL,
	`selected_file_path` text,
	`sidebar_scroll_top` integer DEFAULT 0 NOT NULL,
	`active_worktree_path` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`last_opened_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);--> statement-breakpoint
CREATE INDEX `idx_projects_last_opened` ON `projects` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `repo_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`include_ignored` integer NOT NULL,
	`tree_data` text,
	`status_data` text,
	`size_bytes` integer,
	`accessed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_cache_project_fingerprint_ignored` ON `repo_cache` (`project_id`,`fingerprint`,`include_ignored`);--> statement-breakpoint
CREATE INDEX `idx_repo_cache_project` ON `repo_cache` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_repo_cache_accessed` ON `repo_cache` (`accessed_at`);