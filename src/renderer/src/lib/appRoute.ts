import type { Project, GitStatus } from "../../../shared/types";

export type AppRouteId =
	| "loading"
	| "no-projects"
	| "project-picker"
	| "repo-error"
	| "repo-workspace"
	| "repo-commit-detail"
	| "settings";

export function getAppRouteId(opts: {
	loading: boolean;
	projects: Project[];
	activeProject: Project | null;
	gitStatus: GitStatus | null;
	showSettings: boolean;
	selectedCommitOid: string | null;
}): AppRouteId {
	if (opts.loading) return "loading";
	if (opts.projects.length === 0) return "no-projects";
	if (!opts.activeProject) return "project-picker";
	if (!opts.gitStatus) return "repo-error";
	if (opts.showSettings) return "settings";
	if (opts.selectedCommitOid) return "repo-commit-detail";
	return "repo-workspace";
}
