/**
 * Extracts PR/issue references and URLs from a commit message.
 * Returns { text, href } for each link (href is full URL when we can build it).
 */
export interface ParsedLink {
	text: string;
	href: string;
}

const ISSUE_REF_REGEX = /#(\d+)/g;
const FULL_URL_REGEX = /https?:\/\/(?:www\.)?(?:github|gitlab)\.com\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Parse remote URL to extract owner/repo for building GitHub/GitLab issue URLs.
 */
export function parseRemoteForLinks(remoteUrl: string): {
	owner: string;
	repo: string;
	host: "github" | "gitlab" | null;
} | null {
	try {
		// Handle git@github.com:owner/repo.git or https://github.com/owner/repo
		const sshMatch = remoteUrl.match(
			/^(?:ssh:\/\/)?git@(?:github|gitlab)\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i
		);
		if (sshMatch) {
			const host = remoteUrl.toLowerCase().includes("gitlab") ? "gitlab" : "github";
			return { owner: sshMatch[1]!, repo: sshMatch[2]!.replace(/\.git$/, ""), host };
		}
		const httpsMatch = remoteUrl.match(
			/^https?:\/\/(?:www\.)?(github|gitlab)\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i
		);
		if (httpsMatch) {
			const host = httpsMatch[1]!.toLowerCase() as "github" | "gitlab";
			return { owner: httpsMatch[2]!, repo: httpsMatch[3]!.replace(/\.git$/, ""), host };
		}
	} catch {
		// ignore
	}
	return null;
}

export function extractLinksFromMessage(
	subject: string,
	body: string,
	remoteUrl?: string
): ParsedLink[] {
	const links: ParsedLink[] = [];
	const seen = new Set<string>();
	const fullText = `${subject}\n${body}`;

	const remote = remoteUrl ? parseRemoteForLinks(remoteUrl) : null;

	// Full URLs
	for (const match of fullText.matchAll(FULL_URL_REGEX)) {
		const url = match[0];
		if (!seen.has(url)) {
			seen.add(url);
			links.push({ text: url, href: url });
		}
	}

	// #123 references
	for (const match of fullText.matchAll(ISSUE_REF_REGEX)) {
		const num = match[1]!;
		const text = `#${num}`;
		let href: string;
		if (remote) {
			href =
				remote.host === "github"
					? `https://github.com/${remote.owner}/${remote.repo}/issues/${num}`
					: `https://gitlab.com/${remote.owner}/${remote.repo}/-/issues/${num}`;
		} else {
			href = `#${num}`;
		}
		const key = `ref-${num}`;
		if (!seen.has(key)) {
			seen.add(key);
			links.push({ text, href });
		}
	}

	return links;
}
