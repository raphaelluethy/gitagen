import { asc, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "./sqlite.js";
import { patchCache, repoCache } from "./schema.js";

const LRU_CAP_BYTES = 500 * 1024 * 1024; // 500MB
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function getTotalCacheSize(): Promise<number> {
	const db = await getDb();
	const r1 = await db
		.select({ total: sql<number>`COALESCE(SUM(${repoCache.sizeBytes}), 0)` })
		.from(repoCache);
	const r2 = await db
		.select({ total: sql<number>`COALESCE(SUM(${patchCache.sizeBytes}), 0)` })
		.from(patchCache);
	return ((r1[0]?.total as number) ?? 0) + ((r2[0]?.total as number) ?? 0);
}

async function pruneByTtl(): Promise<void> {
	const cutoff = Math.floor(Date.now() / 1000) - TTL_SECONDS;
	const db = await getDb();
	await Promise.all([
		db.delete(repoCache).where(lt(repoCache.accessedAt, cutoff)),
		db.delete(patchCache).where(lt(patchCache.accessedAt, cutoff)),
	]);
}

async function pruneByLru(targetFreeBytes: number): Promise<number> {
	const db = await getDb();
	let freed = 0;

	// Delete oldest patch_cache entries first (smaller, more granular)
	const patches = await db
		.select({ id: patchCache.id, sizeBytes: patchCache.sizeBytes })
		.from(patchCache)
		.orderBy(asc(patchCache.accessedAt));
	const patchIds: number[] = [];
	for (const p of patches) {
		if (freed >= targetFreeBytes) break;
		patchIds.push(p.id);
		freed += p.sizeBytes ?? 0;
	}
	if (patchIds.length > 0) {
		await db.delete(patchCache).where(inArray(patchCache.id, patchIds));
	}

	// Then repo_cache
	const repos = await db
		.select({ id: repoCache.id, sizeBytes: repoCache.sizeBytes })
		.from(repoCache)
		.orderBy(asc(repoCache.accessedAt));
	const repoIds: number[] = [];
	for (const r of repos) {
		if (freed >= targetFreeBytes) break;
		repoIds.push(r.id);
		freed += r.sizeBytes ?? 0;
	}
	if (repoIds.length > 0) {
		await db.delete(repoCache).where(inArray(repoCache.id, repoIds));
	}

	return freed;
}

export async function runRetention(): Promise<void> {
	await pruneByTtl();
	const total = await getTotalCacheSize();
	if (total > LRU_CAP_BYTES) {
		const toFree = total - LRU_CAP_BYTES;
		await pruneByLru(toFree);
	}
}
