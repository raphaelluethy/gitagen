import { execSync } from "child_process";
import { existsSync } from "fs";
import { createSimpleGitProvider } from "./simple-git-provider.js";
import type { AppSettings } from "../../../shared/types.js";
import type { GitProvider } from "./types.js";

const COMMON_GIT_PATHS = [
	"/usr/bin/git",
	"/opt/homebrew/bin/git",
	"/usr/local/bin/git",
	"/opt/local/bin/git",
];

export function discoverGitBinaries(): string[] {
	const found = new Set<string>();
	for (const p of COMMON_GIT_PATHS) {
		if (existsSync(p) && validateGitBinary(p)) found.add(p);
	}
	try {
		const which = execSync("which git", { encoding: "utf-8", timeout: 1000 }).trim();
		if (which && validateGitBinary(which)) found.add(which);
	} catch {
		// ignore
	}
	return Array.from(found).sort();
}

export function validateGitBinary(binaryPath: string | null): boolean {
	try {
		const cmd = binaryPath ? `"${binaryPath}" --version` : "git --version";
		execSync(cmd, { encoding: "utf-8", timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

export function resolveGitBinary(binaryPath: string | null): string | null {
	if (!binaryPath) return null;
	return validateGitBinary(binaryPath) ? binaryPath : null;
}

export function createGitProvider(settings: Partial<AppSettings> = {}): GitProvider {
	const binary = resolveGitBinary(settings.gitBinaryPath ?? null);
	return createSimpleGitProvider(binary);
}

export interface SshAgentInfo {
	name: string;
	path: string | null;
}

export function getSshAgentInfo(): SshAgentInfo {
	const sock = process.env.SSH_AUTH_SOCK;
	if (sock) return { name: "System SSH Agent", path: sock };
	return { name: "None", path: null };
}

export { ensureSshAuthSock } from "./env.js";
export { createSimpleGitProvider } from "./simple-git-provider.js";
export type { GitProvider, RepoFingerprint } from "./types.js";
