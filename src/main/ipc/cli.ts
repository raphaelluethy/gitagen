import { app, ipcMain } from "electron";
import { execSync } from "child_process";
import { existsSync, lstatSync, readlinkSync, realpathSync } from "fs";
import { dirname, join } from "path";
import type { CliStatus } from "../../shared/types.js";

const CLI_SYMLINK_PATH = "/usr/local/bin/gitagen";
const CLI_SCRIPT_NAME = "gitagen";

function getCliScriptPath(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "cli", CLI_SCRIPT_NAME);
	}
	return join(__dirname, "../../../resources/cli", CLI_SCRIPT_NAME);
}

export async function installCli(): Promise<{ ok: boolean; error?: string }> {
	const targetPath = getCliScriptPath();
	if (!existsSync(targetPath)) {
		return {
			ok: false,
			error: "CLI script not found. Reinstall the app or run from project.",
		};
	}
	try {
		const escapedPath = targetPath.replace(/'/g, "'\\''");
		const cmd = `mkdir -p /usr/local/bin && ln -sf '${escapedPath}' '${CLI_SYMLINK_PATH}'`;
		execSync(
			`osascript -e 'do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges'`,
			{ stdio: "pipe", timeout: 30000 }
		);
		return { ok: true };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Installation failed";
		return { ok: false, error: msg };
	}
}

export async function uninstallCli(): Promise<{ ok: boolean; error?: string }> {
	try {
		if (!existsSync(CLI_SYMLINK_PATH)) {
			return { ok: true };
		}
		execSync(
			`osascript -e 'do shell script "rm -f \\"${CLI_SYMLINK_PATH}\\"" with administrator privileges'`,
			{ stdio: "pipe", timeout: 30000 }
		);
		return { ok: true };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Uninstall failed";
		return { ok: false, error: msg };
	}
}

export function registerCliHandlers(): void {
	ipcMain.handle("cli:getStatus", async (): Promise<CliStatus> => {
		try {
			const stats = lstatSync(CLI_SYMLINK_PATH);
			if (!stats.isSymbolicLink()) {
				return { installed: false, path: null, needsUpdate: false };
			}
			const targetPath = getCliScriptPath();
			const linkTarget = readlinkSync(CLI_SYMLINK_PATH);
			const resolvedLink = join(dirname(CLI_SYMLINK_PATH), linkTarget);
			const realLinkTarget = realpathSync(resolvedLink);
			const realScriptPath = existsSync(targetPath) ? realpathSync(targetPath) : targetPath;
			const needsUpdate = app.isPackaged && realLinkTarget !== realScriptPath;
			return {
				installed: true,
				path: CLI_SYMLINK_PATH,
				needsUpdate,
			};
		} catch {
			return { installed: false, path: null, needsUpdate: false };
		}
	});

	ipcMain.handle("cli:install", () => installCli());
	ipcMain.handle("cli:uninstall", () => uninstallCli());
}
