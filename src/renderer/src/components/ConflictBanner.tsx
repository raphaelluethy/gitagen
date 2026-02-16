import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConflictBannerProps {
	projectId: string;
	onResolved: () => void;
}

export default function ConflictBanner({ projectId, onResolved }: ConflictBannerProps) {
	const [conflictFiles, setConflictFiles] = useState<string[]>([]);

	useEffect(() => {
		window.gitagen.repo.getConflictFiles(projectId).then(setConflictFiles);
	}, [projectId]);

	if (conflictFiles.length === 0) return null;

	return (
		<div className="flex items-center justify-between gap-4 border-b border-amber-600/50 bg-amber-500/10 px-4 py-2 dark:border-amber-500/30 dark:bg-amber-900/20">
			<div className="flex items-center gap-2">
				<AlertTriangle size={16} className="text-amber-600 dark:text-amber-500" />
				<span className="text-sm font-medium text-amber-800 dark:text-amber-200">
					Merge/rebase conflicts ({conflictFiles.length} files)
				</span>
			</div>
			<ul className="truncate text-xs text-amber-700 dark:text-amber-300">
				{conflictFiles.slice(0, 3).join(", ")}
				{conflictFiles.length > 3 && ` +${conflictFiles.length - 3} more`}
			</ul>
		</div>
	);
}
