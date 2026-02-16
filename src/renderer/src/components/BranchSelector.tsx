import { useState, useEffect } from "react";
import { GitBranch, ChevronDown } from "lucide-react";
import type { BranchInfo } from "../../../shared/types";

interface BranchSelectorProps {
	projectId: string;
	currentBranch: string;
	onBranchChange: () => void;
}

export default function BranchSelector({
	projectId,
	currentBranch,
	onBranchChange,
}: BranchSelectorProps) {
	const [branches, setBranches] = useState<BranchInfo[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		window.gitagen.repo.listBranches(projectId).then(setBranches);
	}, [projectId, currentBranch]);

	const handleSwitch = async (name: string) => {
		if (name === currentBranch) {
			setOpen(false);
			return;
		}
		setLoading(true);
		try {
			await window.gitagen.repo.switchBranch(projectId, name);
			onBranchChange();
			setOpen(false);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
				title="Switch branch"
			>
				<GitBranch size={14} />
				<span className="max-w-[120px] truncate">{currentBranch || "detached"}</span>
				<ChevronDown size={12} className={open ? "rotate-180" : ""} />
			</button>
			{open && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
					<div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-auto rounded border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
						{branches.map((b) => (
							<button
								key={b.name}
								type="button"
								onClick={() => handleSwitch(b.name)}
								disabled={loading}
								className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
									b.current
										? "bg-zinc-100 font-medium dark:bg-zinc-800"
										: "hover:bg-zinc-50 dark:hover:bg-zinc-800"
								}`}
							>
								<span className="truncate">{b.name}</span>
								{b.ahead > 0 && (
									<span className="shrink-0 text-xs text-green-600 dark:text-green-400">
										+{b.ahead}
									</span>
								)}
								{b.behind > 0 && (
									<span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
										-{b.behind}
									</span>
								)}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
