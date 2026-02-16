import { BrowserWindow } from "electron";
import type { ConflictState } from "../../shared/types.js";

export const EVENT_REPO_UPDATED = "events:repoUpdated";
export const EVENT_REPO_ERROR = "events:repoError";
export const EVENT_CONFLICT_DETECTED = "events:conflictDetected";

interface RepoUpdatedPayload {
	projectId: string;
	updatedAt: number;
}

interface RepoErrorPayload {
	projectId: string | null;
	message: string;
	name: string;
}

interface ConflictDetectedPayload {
	projectId: string;
	state: ConflictState;
}

function broadcast(channel: string, payload: unknown): void {
	const windows = BrowserWindow.getAllWindows();
	for (const window of windows) {
		if (window.isDestroyed()) continue;
		window.webContents.send(channel, payload);
	}
}

export function emitRepoUpdated(projectId: string): void {
	const payload: RepoUpdatedPayload = { projectId, updatedAt: Date.now() };
	broadcast(EVENT_REPO_UPDATED, payload);
}

export function emitRepoError(projectId: string | null, error: unknown): void {
	let message = "Unknown error";
	let name = "Error";
	if (error instanceof Error) {
		message = error.message;
		name = error.name;
	} else if (typeof error === "string") {
		message = error;
	}
	const payload: RepoErrorPayload = { projectId, message, name };
	broadcast(EVENT_REPO_ERROR, payload);
}

export function emitConflictDetected(projectId: string, state: ConflictState): void {
	const payload: ConflictDetectedPayload = { projectId, state };
	broadcast(EVENT_CONFLICT_DETECTED, payload);
}

export function registerEventsHandlers(): void {
	// No request-response handlers needed; renderer subscribes to event channels.
}
