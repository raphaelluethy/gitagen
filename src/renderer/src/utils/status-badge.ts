export function changeTypeColorClass(changeType: string): string {
	switch (changeType) {
		case "M":
			return "badge-modified";
		case "A":
			return "badge-added";
		case "D":
			return "badge-deleted";
		case "R":
			return "badge-renamed";
		case "?":
			return "badge-untracked";
		default:
			return "badge-untracked";
	}
}

export function changeTypeLabel(changeType: string): string {
	switch (changeType) {
		case "M":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "?":
			return "untracked";
		default:
			return "unknown";
	}
}
