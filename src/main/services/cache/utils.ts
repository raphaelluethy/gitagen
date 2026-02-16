import type { ProjectPrefs } from "../../../shared/types.js";
import type { ProjectPrefsRow } from "./queries.js";

export function prefsRowToPrefs(row: ProjectPrefsRow): ProjectPrefs {
	return {
		includeIgnored: Boolean(row.include_ignored),
		changedOnly: Boolean(row.changed_only),
		expandedDirs: JSON.parse(row.expanded_dirs || "[]"),
		selectedFilePath: row.selected_file_path,
		sidebarScrollTop: row.sidebar_scroll_top,
		activeWorktreePath: row.active_worktree_path ?? null,
	};
}
