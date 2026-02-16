import { execSync, spawnSync } from "child_process";
import type { ConfigEntry } from "../../../shared/types.js";

export function getEffectiveConfig(cwd: string): ConfigEntry[] {
	try {
		const out = execSync("git config --list --show-origin --show-scope", {
			cwd,
			encoding: "utf-8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
		const entries: ConfigEntry[] = [];
		for (const line of out.split("\n")) {
			if (!line.trim()) continue;
			// Format: <scope> <file>:<key>=<value> or <scope> <file>:<key> <value>
			const scopeMatch = line.match(/^(system|global|local|worktree)\s+/);
			if (!scopeMatch) continue;
			const scope = scopeMatch[1] as ConfigEntry["scope"];
			const rest = line.slice(scopeMatch[0].length);
			const colonIdx = rest.indexOf(":");
			if (colonIdx === -1) continue;
			const origin = rest.slice(0, colonIdx).trim();
			const keyVal = rest.slice(colonIdx + 1).trim();
			const eqIdx = keyVal.indexOf("=");
			let key: string;
			let value: string;
			if (eqIdx !== -1) {
				key = keyVal.slice(0, eqIdx).trim();
				value = keyVal.slice(eqIdx + 1).trim();
			} else {
				key = keyVal;
				value = "";
			}
			entries.push({ key, value, origin, scope });
		}
		return entries;
	} catch {
		return [];
	}
}

export function setLocalConfig(cwd: string, key: string, value: string): void {
	spawnSync("git", ["config", "--local", key, value], {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
}
