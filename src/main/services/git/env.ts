import { execSync } from "child_process";

/**
 * Ensure SSH_AUTH_SOCK is available in process.env.
 * Electron apps launched from Finder/Dock may not inherit shell env vars,
 * so we fall back to asking launchd for the value on macOS.
 */
export function ensureSshAuthSock(): void {
	if (process.env.SSH_AUTH_SOCK) return;

	if (process.platform === "darwin") {
		try {
			const sock = execSync("launchctl getenv SSH_AUTH_SOCK", {
				encoding: "utf-8",
				timeout: 2000,
			}).trim();
			if (sock) {
				process.env.SSH_AUTH_SOCK = sock;
			}
		} catch {
			// launchctl not available or no SSH_AUTH_SOCK set – nothing we can do
		}
	}
}
