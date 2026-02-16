export interface FuzzyMatch {
	score: number;
	indices: number[];
}

function isWordStart(text: string, index: number): boolean {
	if (index <= 0) return true;
	const prev = text[index - 1] ?? "";
	return prev === " " || prev === "-" || prev === "_" || prev === "/";
}

export function fuzzyMatch(queryRaw: string, textRaw: string): FuzzyMatch | null {
	const query = queryRaw.trim().toLowerCase();
	const text = textRaw.toLowerCase();
	if (!query) return { score: 0, indices: [] };
	if (!text) return null;

	const indices: number[] = [];
	let qi = 0;
	let score = 0;
	let consecutive = 0;

	for (let ti = 0; ti < text.length && qi < query.length; ti += 1) {
		if (query[qi] !== text[ti]) continue;
		indices.push(ti);
		score += 1;
		if (isWordStart(textRaw, ti)) score += 3;
		if (ti === 0) score += 2;
		if (consecutive > 0) score += 2 + consecutive;
		consecutive += 1;
		qi += 1;
	}

	if (qi !== query.length) return null;

	const compactnessBonus = Math.max(0, query.length * 2 - (indices.at(-1)! - indices[0]));
	score += compactnessBonus;

	return { score, indices };
}

export function matchLabelWithKeywords(
	query: string,
	label: string,
	keywords: string[]
): FuzzyMatch | null {
	const labelMatch = fuzzyMatch(query, label);
	if (labelMatch) return labelMatch;

	let best: FuzzyMatch | null = null;
	for (const keyword of keywords) {
		const match = fuzzyMatch(query, keyword);
		if (!match) continue;
		if (!best || match.score > best.score) {
			best = match;
		}
	}
	if (!best) return null;
	return { score: Math.max(1, best.score - 1), indices: [] };
}
