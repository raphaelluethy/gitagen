export function changeTypeColorClass(changeType: string): string {
	switch (changeType) {
		case "M":
			return "bg-amber-500/80 text-white";
		case "A":
			return "bg-emerald-600/80 text-white";
		case "D":
			return "bg-red-600/80 text-white";
		case "R":
			return "bg-blue-600/80 text-white";
		case "?":
			return "bg-zinc-500/80 text-white";
		default:
			return "bg-zinc-500/80 text-white";
	}
}
