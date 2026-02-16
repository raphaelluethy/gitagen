import { FSWatcher, watch } from "fs";
import { join } from "path";
import { emitRepoUpdated } from "../../ipc/events.js";

const watchers = new Map<string, { watchers: FSWatcher[]; debounce: NodeJS.Timeout | null }>();
const DEBOUNCE_MS = 300;

function closeWatchers(entry: { watchers: FSWatcher[]; debounce: NodeJS.Timeout | null }): void {
	for (const w of entry.watchers) {
		w.close();
	}
	if (entry.debounce) {
		clearTimeout(entry.debounce);
	}
}

export function watchProject(projectId: string, cwd: string): void {
	unwatchProject(projectId);

	const gitDir = join(cwd, ".git");
	const watchersList: FSWatcher[] = [];
	let debounce: NodeJS.Timeout | null = null;

	const triggerRefresh = (): void => {
		if (debounce) {
			clearTimeout(debounce);
		}
		debounce = setTimeout(() => {
			emitRepoUpdated(projectId);
			debounce = null;
		}, DEBOUNCE_MS);
	};

	const handleEvent = (_eventType: string, filename: string | Buffer | null): void => {
		if (!filename) return;
		triggerRefresh();
	};

	try {
		const gitWatcher = watch(gitDir, { recursive: false, persistent: false }, handleEvent);
		watchersList.push(gitWatcher);
	} catch {
		// .git may not exist or be inaccessible
	}

	try {
		const indexWatcher = watch(join(gitDir, "index"), { persistent: false }, handleEvent);
		watchersList.push(indexWatcher);
	} catch {
		// index may not exist
	}

	try {
		const refsWatcher = watch(
			join(gitDir, "refs"),
			{ recursive: true, persistent: false },
			handleEvent
		);
		watchersList.push(refsWatcher);
	} catch {
		// refs may not exist
	}

	try {
		const cwdWatcher = watch(cwd, { recursive: false, persistent: false }, handleEvent);
		watchersList.push(cwdWatcher);
	} catch {
		// cwd may not be watchable
	}

	if (watchersList.length === 0) {
		return;
	}

	watchers.set(projectId, { watchers: watchersList, debounce: null });
}

export function unwatchProject(projectId: string): void {
	const entry = watchers.get(projectId);
	if (entry) {
		closeWatchers(entry);
		watchers.delete(projectId);
	}
}

export function unwatchAll(): void {
	for (const entry of watchers.values()) {
		closeWatchers(entry);
	}
	watchers.clear();
}
