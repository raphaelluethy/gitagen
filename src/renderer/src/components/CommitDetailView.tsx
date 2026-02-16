import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { CommitDetail, DiffStyle, RemoteInfo } from "../../../shared/types";
import { useTheme } from "../theme/provider";
import { extractLinksFromMessage, type ParsedLink } from "../utils/commit-links";
import { splitPatchByFile } from "../utils/split-patch";
import { changeTypeColorClass } from "../utils/status-badge";
import GravatarAvatar from "./GravatarAvatar";
import { useToast } from "../toast/provider";

interface CommitDetailViewProps {
	projectId: string;
	oid: string;
	diffStyle: DiffStyle;
	onClose: () => void;
}

function formatDate(dateStr: string): { absolute: string; relative: string } {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);
	const hours = Math.floor((diff % 86400000) / 3600000);
	const minutes = Math.floor((diff % 3600000) / 60000);

	let relative: string;
	if (days > 7) relative = date.toLocaleDateString();
	else if (days > 0) relative = `${days}d ago`;
	else if (hours > 0) relative = `${hours}h ago`;
	else if (minutes > 0) relative = `${minutes}m ago`;
	else relative = "just now";

	return {
		absolute: date.toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}),
		relative,
	};
}

function detectChangeType(patch: string): string {
	if (patch.includes("new file mode")) return "A";
	if (patch.includes("deleted file mode")) return "D";
	if (patch.includes("rename from")) return "R";
	return "M";
}

export default function CommitDetailView({
	projectId,
	oid,
	diffStyle,
	onClose,
}: CommitDetailViewProps) {
	const { resolved } = useTheme();
	const { toast } = useToast();
	const [detail, setDetail] = useState<CommitDetail | null>(null);
	const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const requestIdRef = useRef(0);

	useEffect(() => {
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setLoading(true);
		Promise.all([
			window.gitagen.repo.getCommitDetail(projectId, oid),
			window.gitagen.repo.listRemotes(projectId),
		])
			.then(([commit, remotesList]) => {
				if (requestIdRef.current !== requestId) return;
				setDetail(commit ?? null);
				setRemotes(remotesList ?? []);
			})
			.finally(() => {
				if (requestIdRef.current === requestId) setLoading(false);
			});
	}, [projectId, oid]);

	const handleOpenLink = (href: string) => {
		if (href.startsWith("http")) {
			window.gitagen.app.openExternal(href);
		}
	};

	if (loading && !detail) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-(--border-primary) border-t-(--text-muted)" />
				<p className="text-sm text-(--text-muted)">Loading commit...</p>
			</div>
		);
	}

	if (!detail) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
				<p className="text-sm text-(--text-muted)">Commit not found</p>
				<button
					type="button"
					onClick={onClose}
					className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
					title="Back"
				>
					<ArrowLeft size={16} />
					<span>Back</span>
				</button>
			</div>
		);
	}

	const remoteUrl = remotes[0]?.url;
	const links = extractLinksFromMessage(detail.message, detail.body, remoteUrl);
	const dateFormatted = formatDate(detail.author.date);
	const filePatches = splitPatchByFile(detail.patch);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-auto">
				<div className="flex flex-col">
					<div className="shrink-0 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-3">
						<div className="flex items-start gap-2">
							<button
								type="button"
								onClick={onClose}
								className="-ml-1 shrink-0 rounded p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
								title="Back to working directory"
							>
								<ArrowLeft size={16} />
							</button>
							<div className="min-w-0 flex-1">
								<h2 className="text-[15px] font-semibold leading-snug text-(--text-primary)">
									{detail.message.split("\n")[0]}
								</h2>
								<code
									className="mt-1 inline-block cursor-pointer font-mono text-[11px] text-(--text-muted) transition-colors hover:text-(--text-primary)"
									title="Copy commit hash"
									onClick={() => {
										navigator.clipboard.writeText(detail.oid);
										toast.success("Copied", detail.oid.slice(0, 7));
									}}
								>
									{detail.oid}
								</code>
							</div>
						</div>
						<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
							<div className="flex items-center gap-2">
								<GravatarAvatar
									email={detail.author.email}
									name={detail.author.name}
									size={32}
								/>
								<div>
									<p className="text-[13px] font-medium text-(--text-primary)">
										{detail.author.name}
									</p>
									<p className="text-[11px] text-(--text-muted)">
										{detail.author.email}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2 text-[12px] text-(--text-muted)">
								<span title={dateFormatted.absolute}>{dateFormatted.relative}</span>
								{detail.signed && (
									<span className="inline-flex items-center gap-1 rounded-md bg-(--success-bg) px-1.5 py-0.5 text-(--success)">
										<Shield size={12} />
										signed
									</span>
								)}
							</div>
						</div>
						{detail.body.trim() && (
							<pre className="mt-4 whitespace-pre-wrap rounded-lg border border-(--border-secondary) bg-(--bg-secondary) p-4 font-mono text-[12px] leading-relaxed text-(--text-secondary)">
								{detail.body.trim()}
							</pre>
						)}
						{links.length > 0 && (
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<span className="text-[11px] font-medium uppercase tracking-wider text-(--text-muted)">
									Links
								</span>
								{links.map((link: ParsedLink) => (
									<button
										key={link.href}
										type="button"
										onClick={() => handleOpenLink(link.href)}
										className="rounded border border-(--border-secondary) bg-(--bg-tertiary) px-2.5 py-1 text-[12px] font-medium text-(--accent-primary) transition-colors hover:bg-(--bg-hover) hover:border-(--border-primary)"
									>
										{link.text}
									</button>
								))}
							</div>
						)}
					</div>
					{filePatches.length === 0 ? (
						<div className="flex items-center justify-center p-8">
							<p className="text-sm text-(--text-muted)">No file changes</p>
						</div>
					) : (
						<div className="divide-y divide-(--border-secondary)">
							{filePatches.map(({ path, patch }) => {
								const changeType = detectChangeType(patch);
								return (
									<div key={path} className="bg-(--bg-primary)">
										<div className="flex items-center gap-2 border-b border-(--border-secondary) bg-(--bg-panel) px-4 py-2">
											<span
												className={`badge ${changeTypeColorClass(changeType)}`}
												title={changeType}
											>
												{changeType}
											</span>
											<span className="font-mono text-[13px] text-(--text-primary)">
												{path}
											</span>
										</div>
										<div className="[&_pre]:bg-transparent! [&_pre]:font-mono! [&_pre]:text-[13px]!">
											<PatchDiff
												patch={patch}
												options={{
													theme:
														resolved === "dark"
															? "github-dark"
															: "github-light",
													diffStyle,
													disableLineNumbers: false,
												}}
												className="min-h-0"
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
