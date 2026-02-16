import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { app } from "electron";
import { join } from "path";
import * as schema from "./schema.js";

let client: ReturnType<typeof createClient> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDbPath(): string {
	return join(app.getPath("userData"), "gitagen.db");
}

function getMigrationsPath(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "drizzle");
	}
	return join(__dirname, "../../drizzle");
}

export async function getDb(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
	if (db) return db;
	const url = process.env.DATABASE_URL ?? `file:${getDbPath()}`;
	client = createClient({ url });
	db = drizzle({ client, schema });
	await migrate(db, { migrationsFolder: getMigrationsPath() });
	return db;
}

export async function closeDb(): Promise<void> {
	if (client) {
		client.close();
		client = null;
		db = null;
	}
}
