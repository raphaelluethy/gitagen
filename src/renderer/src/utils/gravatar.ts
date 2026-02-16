/**
 * Gravatar URL generation using SHA-256 (per Gravatar docs).
 * Images are cached by the browser via normal img loading.
 */
const GRAVATAR_BASE = "https://www.gravatar.com/avatar";

const hashCache = new Map<string, string>();

async function sha256Hex(str: string): Promise<string> {
	const encoded = new TextEncoder().encode(str);
	const hash = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function getGravatarUrl(email: string, size = 64): Promise<string> {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return "";
	const cached = hashCache.get(normalized);
	if (cached) {
		return `${GRAVATAR_BASE}/${cached}?s=${size}&d=404`;
	}
	const hash = await sha256Hex(normalized);
	hashCache.set(normalized, hash);
	return `${GRAVATAR_BASE}/${hash}?s=${size}&d=404`;
}
