import { useState, useEffect } from "react";
import { GitBranch, ChevronDown, Check } from "lucide-react";
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
				className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] outline-none transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
				title="Switch branch"
			>
				<GitBranch size={14} className="text-[var(--accent-primary)]" />
				<code className="max-w-[140px] truncate font-mono">
					{currentBranch || "detached"}
				</code>
				<ChevronDown
					size={12}
					className={`text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
					<div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-lg">
						<div className="border-b border-[var(--border-secondary)] px-4 py-2">
							<p className="section-title">Branches</p>
						</div>
						{branches.map((b) => (
							<button
								key={b.name}
								type="button"
								onClick={() => handleSwitch(b.name)}
								disabled={loading}
								className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] outline-none transition-colors ${
									b.current
										? "bg-[var(--bg-hover)]"
										: "hover:bg-[var(--bg-hover)]"
								}`}
							>
								<span
									className={`w-4 ${b.current ? "text-[var(--success)]" : "invisible"}`}
								>
									<Check size={14} />
								</span>
								<code
									className={`flex-1 truncate font-mono text-xs ${
										b.current
											? "font-medium text-[var(--text-primary)]"
											: "text-[var(--text-secondary)]"
									}`}
								>
									{b.name}
								</code>
								{b.ahead > 0 && (
									<span className="shrink-0 rounded bg-[var(--success-bg)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--success)]">
										+{b.ahead}
									</span>
								)}
								{b.behind > 0 && (
									<span className="shrink-0 rounded bg-[var(--warning-bg)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--warning)]">
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
