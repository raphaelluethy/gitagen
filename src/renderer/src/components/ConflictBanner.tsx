import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConflictBannerProps {
	projectId: string;
	onResolved: () => void;
}

export default function ConflictBanner({
	projectId,
	onResolved: _onResolved,
}: ConflictBannerProps) {
	const [conflictFiles, setConflictFiles] = useState<string[]>([]);

	useEffect(() => {
		window.gitagen.repo.getConflictFiles(projectId).then(setConflictFiles);
	}, [projectId]);

	if (conflictFiles.length === 0) return null;

	return (
		<div className="flex items-center justify-between gap-4 border-b border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-2.5">
			<div className="flex items-center gap-2.5">
				<AlertTriangle size={16} className="text-[var(--warning)]" />
				<span className="text-[13px] font-medium text-[var(--warning)]">
					Merge/rebase conflicts ({conflictFiles.length} files)
				</span>
			</div>
			<div className="flex items-center gap-2">
				<span className="truncate text-xs text-[var(--warning)]/80">
					{conflictFiles.slice(0, 3).join(", ")}
					{conflictFiles.length > 3 && ` +${conflictFiles.length - 3} more`}
				</span>
			</div>
		</div>
	);
}
