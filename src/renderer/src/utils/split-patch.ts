/**
 * Splits a combined git patch string into per-file patches.
 * Uses the "b/" path (new file path) from "diff --git a/X b/Y".
 */
export function splitPatchByFile(patch: string): { path: string; patch: string }[] {
	if (!patch.trim()) return [];
	const result: { path: string; patch: string }[] = [];
	const chunks = patch.split(/(?=^diff --git )/m).filter(Boolean);
	for (const chunk of chunks) {
		const firstLine = chunk.split("\n")[0] ?? "";
		const match = firstLine.match(/ b\/(.+)$/);
		if (match) {
			result.push({
				path: match[1]!.replace(/^"|"$/g, "").replace(/\\"/g, '"'),
				patch: chunk.trim(),
			});
		}
	}
	return result;
}
