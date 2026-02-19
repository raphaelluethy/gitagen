import type { GitFileStatus } from "../../../../shared/types";

export interface FileTreeNode {
	name: string;
	type: "file" | "folder";
	path: string;
	file?: GitFileStatus;
	children?: FileTreeNode[];
}
