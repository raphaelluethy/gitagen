import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ONEPASSWORD_AGENT_SOCK = join(
	homedir(),
	"Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
);

export function get1PasswordAgentPath(): string | null {
	if (existsSync(ONEPASSWORD_AGENT_SOCK)) {
		return ONEPASSWORD_AGENT_SOCK;
	}
	return null;
}

export interface GitEnv {
	SSH_AUTH_SOCK?: string;
	GIT_SSH_COMMAND?: string;
}

export function buildGitEnv(
	use1Password: boolean,
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const env = { ...baseEnv };
	if (use1Password) {
		const sock = get1PasswordAgentPath();
		if (sock) {
			env.SSH_AUTH_SOCK = sock;
		}
	}
	return env;
}
