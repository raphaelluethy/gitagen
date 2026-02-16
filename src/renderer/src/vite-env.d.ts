/// <reference types="vite/client" />
import type { GitStatus } from "../../shared/types";

declare global {
	interface Window {
		api: {
			getStatus: (cwd?: string) => Promise<GitStatus | null>;
			getFileDiff: (
				cwd: string,
				filePath: string,
				mode: "staged" | "unstaged" | "untracked"
			) => Promise<string | null>;
		};
	}
}
