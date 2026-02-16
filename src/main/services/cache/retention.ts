import { getDb } from "./sqlite.js";

const LRU_CAP_BYTES = 500 * 1024 * 1024; // 500MB
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getTotalCacheSize(): number {
	const r1 = getDb()
		.prepare("SELECT COALESCE(SUM(size_bytes), 0) as total FROM repo_cache")
		.get() as { total: number };
	const r2 = getDb()
		.prepare("SELECT COALESCE(SUM(size_bytes), 0) as total FROM patch_cache")
		.get() as { total: number };
	return (r1?.total ?? 0) + (r2?.total ?? 0);
}

function pruneByTtl(): number {
	const cutoff = Math.floor(Date.now() / 1000) - TTL_SECONDS;
	const db = getDb();
	const r1 = db.prepare("DELETE FROM repo_cache WHERE accessed_at < ?").run(cutoff);
	const r2 = db.prepare("DELETE FROM patch_cache WHERE accessed_at < ?").run(cutoff);
	return r1.changes + r2.changes;
}

function pruneByLru(targetFreeBytes: number): number {
	const db = getDb();
	let freed = 0;

	// Delete oldest patch_cache entries first (smaller, more granular)
	const patches = db
		.prepare("SELECT id, size_bytes FROM patch_cache ORDER BY accessed_at ASC")
		.all() as { id: number; size_bytes: number }[];

	for (const p of patches) {
		if (freed >= targetFreeBytes) break;
		db.prepare("DELETE FROM patch_cache WHERE id = ?").run(p.id);
		freed += p.size_bytes ?? 0;
	}

	// Then repo_cache
	const repos = db
		.prepare("SELECT id, size_bytes FROM repo_cache ORDER BY accessed_at ASC")
		.all() as { id: number; size_bytes: number }[];

	for (const r of repos) {
		if (freed >= targetFreeBytes) break;
		db.prepare("DELETE FROM repo_cache WHERE id = ?").run(r.id);
		freed += r.size_bytes ?? 0;
	}

	return freed;
}

export function runRetention(): void {
	pruneByTtl();
	const total = getTotalCacheSize();
	if (total > LRU_CAP_BYTES) {
		const toFree = total - LRU_CAP_BYTES;
		pruneByLru(toFree);
	}
}
