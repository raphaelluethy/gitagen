import { execSync, spawnSync } from "child_process";
import type { ConfigEntry } from "../../../shared/types.js";

function normalizeScope(scope: string): ConfigEntry["scope"] {
	switch (scope) {
		case "system":
		case "global":
		case "local":
		case "worktree":
			return scope;
		default:
			return "unknown";
	}
}

export function getEffectiveConfig(cwd: string): ConfigEntry[] {
	try {
		const out = execSync("git config --list --show-origin --show-scope --null", {
			cwd,
			encoding: "utf-8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
		const parts = out.split("\0");
		const entries: ConfigEntry[] = [];
		for (let i = 0; i + 2 < parts.length; i += 3) {
			const scopeRaw = parts[i]?.trim();
			if (!scopeRaw) continue;
			const origin = (parts[i + 1] ?? "").trim();
			const keyValue = parts[i + 2] ?? "";
			const newlineIdx = keyValue.indexOf("\n");
			const key = (newlineIdx === -1 ? keyValue : keyValue.slice(0, newlineIdx)).trim();
			const value = newlineIdx === -1 ? "" : keyValue.slice(newlineIdx + 1).trim();
			if (!key) continue;
			entries.push({
				key,
				value,
				origin,
				scope: normalizeScope(scopeRaw),
			});
		}
		return entries;
	} catch {
		return [];
	}
}

export function setLocalConfig(cwd: string, key: string, value: string): void {
	const result = spawnSync("git", ["config", "--local", key, value], {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	if (result.status !== 0) {
		throw new Error(
			result.stderr?.trim() || result.stdout?.trim() || "Failed to set local config"
		);
	}
}

export function testSigningConfig(
	cwd: string,
	keyOverride?: string
): { ok: boolean; message: string } {
	const entries = getEffectiveConfig(cwd);
	const cfgVal = (k: string): string => {
		for (let i = entries.length - 1; i >= 0; i--) {
			if (entries[i].key === k && entries[i].value.trim()) return entries[i].value.trim();
		}
		return "";
	};

	const key = keyOverride?.trim() || cfgVal("user.signingkey");
	if (!key) {
		return {
			ok: false,
			message: "No signing key configured. Set user.signingkey in your git config.",
		};
	}

	// Resolve a tree object to create the test signature against
	const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	if (tree.status !== 0 || !tree.stdout.trim()) {
		return {
			ok: false,
			message: "No commits in this repository yet — cannot test signing.",
		};
	}

	// Build args: respect the full existing config (gpg.format,
	// gpg.ssh.program, etc.) and only override what's necessary.
	const args: string[] = [];
	if (!cfgVal("gpg.format")) args.push("-c", "gpg.format=ssh");
	if (keyOverride?.trim()) args.push("-c", `user.signingkey=${keyOverride.trim()}`);

	args.push("commit-tree", tree.stdout.trim(), "-S", "-m", "gitagen signing test");

	// Create a signed dangling commit object — exercises the full
	// signing pipeline without touching any refs.
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf-8",
		timeout: 15_000,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});

	if (result.status === 0 && result.stdout.trim()) {
		return { ok: true, message: `Signing works. Key: ${key}` };
	}
	return {
		ok: false,
		message:
			result.stderr?.trim() ||
			result.stdout?.trim() ||
			"Signing failed — check your SSH agent and key.",
	};
}
