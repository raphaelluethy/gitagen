import type { GitFileStatus } from "../../../../shared/types";
import type { FileTreeNode } from "./types";

interface MutableNode {
	name: string;
	type: "file" | "folder";
	path: string;
	file?: GitFileStatus;
	children?: Map<string, MutableNode>;
}

function toFileTreeNode(map: Map<string, MutableNode>): FileTreeNode[] {
	return Array.from(map.entries())
		.map(([, node]) => {
			const result: FileTreeNode = {
				name: node.name,
				type: node.type,
				path: node.path,
				...(node.file && { file: node.file }),
			};
			if (node.type === "folder" && node.children) {
				result.children = toFileTreeNode(node.children);
			}
			return result;
		})
		.sort((a, b) => {
			const aIsFolder = a.type === "folder";
			const bIsFolder = b.type === "folder";
			if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});
}

export function buildFileTree(files: GitFileStatus[]): FileTreeNode[] {
	const root: Map<string, MutableNode> = new Map();

	for (const file of files) {
		const parts = file.path.split("/");
		let currentLevel = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (isLast) {
				currentLevel.set(part, { name: part, type: "file", path: file.path, file });
			} else {
				if (!currentLevel.has(part)) {
					currentLevel.set(part, {
						name: part,
						type: "folder",
						path: pathSoFar,
						children: new Map(),
					});
				}
				const node = currentLevel.get(part)!;
				currentLevel = node.children!;
			}
		}
	}

	return toFileTreeNode(root);
}

export function collectFilePaths(node: FileTreeNode): string[] {
	if (node.type === "file" && node.file) return [node.file.path];
	if (!node.children) return [];
	return node.children.flatMap(collectFilePaths);
}

export function statusBarColor(changeType: string): string {
	switch (changeType) {
		case "A":
			return "var(--change-added)";
		case "D":
			return "var(--change-deleted)";
		default:
			return "var(--change-modified)";
	}
}
