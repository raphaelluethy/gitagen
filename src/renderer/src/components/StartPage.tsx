import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen, Plus, GitBranch, Check, GitFork, ChevronRight } from "lucide-react";
import type { GroupedProject, Project, RepoStatus } from "../../../shared/types";

const CARD_MIN_WIDTH = 280;
const CARD_ROW_HEIGHT = 120;
const OVERSCAN = 2;

function formatRelativeTime(lastOpenedAt: number): string {
	const sec = Math.floor(Date.now() / 1000) - lastOpenedAt;
	if (sec < 60) return "just now";
	if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
	if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
	if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;
	if (sec < 31536000) return `${Math.floor(sec / 2592000)}mo ago`;
	return `${Math.floor(sec / 31536000)}y ago`;
}

function shortenPath(path: string): string {
	try {
		const home = typeof process !== "undefined" ? (process.env.HOME ?? "") : "";
		if (home && path.startsWith(home)) {
			return `~${path.slice(home.length)}`;
		}
	} catch {
		// ignore
	}
	return path;
}

interface ProjectCardProps {
	project: Project;
	status?: RepoStatus | null;
	isRecent: boolean;
	onOpen: () => void;
	worktreeCount?: number;
	worktreeChildren?: Project[];
	onOpenWorktree?: (project: Project) => void;
	animationDelay?: number;
}

function ProjectCard({
	project,
	status,
	isRecent,
	onOpen,
	worktreeCount,
	worktreeChildren,
	onOpenWorktree,
	animationDelay = 0,
}: ProjectCardProps) {
	const changeCount =
		status && status.staged.length + status.unstaged.length + status.untracked.length;
	const isLoading = isRecent && status === undefined;

	return (
		<button
			type="button"
			onClick={onOpen}
			className="group relative flex w-full flex-col gap-3 rounded-xl border border-(--border-secondary) bg-(--bg-secondary) px-5 py-4 text-left outline-none transition-all duration-200 ease-out hover:border-(--border-primary) hover:bg-(--bg-hover) hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] focus-visible:ring-2 focus-visible:ring-(--border-focus) focus-visible:ring-offset-2 dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-startpage-card"
			style={{
				animationDelay: `${animationDelay}ms`,
			}}
		>
			<div className="flex min-w-0 items-start gap-4">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-(--bg-tertiary) transition-colors duration-200 group-hover:bg-(--bg-active)">
					<FolderOpen
						size={22}
						className="text-(--text-muted) transition-colors duration-200 group-hover:text-(--accent-primary)"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="break-words text-[15px] font-semibold leading-snug text-(--text-primary)">
						{project.name}
					</p>
					<p
						className="mt-0.5 truncate font-mono text-xs leading-relaxed text-(--text-muted)"
						title={project.path}
					>
						{shortenPath(project.path)}
					</p>
				</div>
				<ChevronRight
					size={18}
					className="shrink-0 text-(--text-muted) opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
				/>
			</div>
			{isRecent && (
				<div className="flex flex-wrap items-center gap-2.5">
					{isLoading ? (
						<div className="h-6 w-28 animate-pulse rounded-md bg-(--bg-tertiary)" />
					) : status ? (
						<>
							<span className="inline-flex items-center gap-1.5 rounded-md bg-(--bg-tertiary) px-2 py-1 font-mono text-xs text-(--text-secondary)">
								<GitBranch size={12} strokeWidth={2} />
								{status.branch || "detached"}
							</span>
							{changeCount !== undefined && (
								<span
									className={
										changeCount === 0
											? "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-(--success)"
											: "badge badge-modified"
									}
								>
									{changeCount === 0 ? (
										<>
											<Check size={12} strokeWidth={2.5} />
											clean
										</>
									) : (
										`${changeCount} change${changeCount === 1 ? "" : "s"}`
									)}
								</span>
							)}
						</>
					) : null}
					{worktreeCount !== undefined && worktreeCount > 0 && (
						<span className="inline-flex items-center gap-1.5 text-xs text-(--text-muted)">
							<GitFork size={12} />
							{worktreeCount} worktree{worktreeCount === 1 ? "" : "s"}
						</span>
					)}
				</div>
			)}
			{!isRecent && (
				<p className="text-xs text-(--text-muted)">
					Opened {formatRelativeTime(project.lastOpenedAt)}
				</p>
			)}
			{worktreeChildren && worktreeChildren.length > 0 && onOpenWorktree && (
				<div className="flex flex-col gap-1.5 border-t border-(--border-secondary) pt-3">
					<p className="text-[11px] font-medium uppercase tracking-wider text-(--text-muted)">
						Worktrees
					</p>
					{worktreeChildren.map((wt) => (
						<button
							key={wt.id}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onOpenWorktree(wt);
							}}
							className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-tertiary)"
						>
							<GitFork size={12} />
							<span className="truncate">{wt.name}</span>
						</button>
					))}
				</div>
			)}
			<div className="mt-auto flex justify-end pt-1">
				<span className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-primary) bg-transparent px-3 py-1.5 text-xs font-medium text-(--text-primary) transition-all duration-200 group-hover:border-(--accent-primary) group-hover:bg-(--bg-tertiary)">
					Open
					<ChevronRight
						size={14}
						className="transition-transform duration-200 group-hover:translate-x-0.5"
					/>
				</span>
			</div>
		</button>
	);
}

function buildDisplayList(grouped: GroupedProject[]): GroupedProject[] {
	return grouped.filter((p) => !p.parentProjectId);
}

interface StartPageProps {
	projects: Project[];
	onSelectProject: (project: Project) => void;
	onAddProject: () => void;
}

export default function StartPage({ projects, onSelectProject, onAddProject }: StartPageProps) {
	const [grouped, setGrouped] = useState<GroupedProject[] | null>(null);
	const [statusMap, setStatusMap] = useState<Record<string, RepoStatus | null>>({});
	const scrollRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(600);

	useEffect(() => {
		window.gitagen.projects.listGrouped().then((list) => {
			setGrouped(list);
		});
	}, []);

	const roots = buildDisplayList(grouped ?? projects.map((p) => ({ ...p })));
	const recent = roots.slice(0, 4);
	const other = roots.slice(4);

	const recentIds = recent.map((p) => p.id).join(",");
	useEffect(() => {
		for (const p of recent) {
			window.gitagen.repo.getStatus(p.id).then((status) => {
				setStatusMap((prev) => ({ ...prev, [p.id]: status }));
			});
		}
	}, [recentIds]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width ?? 600;
			setContainerWidth(w);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const colCount = Math.max(1, Math.min(3, Math.floor(containerWidth / CARD_MIN_WIDTH)));
	const rowCount = Math.ceil(other.length / colCount);

	const rowVirtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => CARD_ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	const handleOpen = useCallback(
		(p: Project) => {
			onSelectProject(p);
		},
		[onSelectProject]
	);

	return (
		<div className="flex h-screen flex-col bg-(--bg-primary)">
			{/* Subtle top gradient for depth - works in light and dark */}
			<div
				className="pointer-events-none fixed inset-x-0 top-0 z-0 h-48 opacity-[0.03] dark:opacity-[0.06]"
				style={{
					background:
						"radial-gradient(ellipse 80% 50% at 50% 0%, var(--accent-primary), transparent)",
				}}
			/>

			<header className="relative z-10 flex shrink-0 items-center justify-between border-b border-(--border-secondary) bg-(--bg-primary)/80 px-8 py-5 backdrop-blur-sm">
				<div className="flex items-baseline gap-3">
					<h1 className="text-lg font-semibold tracking-tight text-(--text-primary)">
						Projects
					</h1>
					<span className="text-sm text-(--text-muted)">{roots.length} repositories</span>
				</div>
				<button
					type="button"
					onClick={onAddProject}
					className="btn btn-primary flex items-center gap-2"
				>
					<Plus size={16} strokeWidth={2} />
					Add repository
				</button>
			</header>

			<div
				ref={containerRef}
				className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden px-8"
			>
				{recent.length > 0 && (
					<section className="shrink-0 py-10">
						<h2 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)">
							Recent
						</h2>
						<div
							className="grid gap-5"
							style={{
								gridTemplateColumns: `repeat(${colCount}, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
							}}
						>
							{recent.map((p, i) => (
								<ProjectCard
									key={p.id}
									project={p}
									status={statusMap[p.id]}
									isRecent
									onOpen={() => handleOpen(p)}
									worktreeCount={p.worktreeChildren?.length}
									worktreeChildren={p.worktreeChildren}
									onOpenWorktree={handleOpen}
									animationDelay={i * 50}
								/>
							))}
						</div>
					</section>
				)}
				{other.length > 0 ? (
					<section className="flex min-h-0 flex-1 flex-col pt-6">
						<h2 className="mb-4 shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)">
							All projects
						</h2>
						<div ref={scrollRef} className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
							<div
								style={{
									height: `${rowVirtualizer.getTotalSize()}px`,
									width: "100%",
									position: "relative",
								}}
							>
								{rowVirtualizer.getVirtualItems().map((virtualRow) => {
									const start = virtualRow.index * colCount;
									const rowProjects = other.slice(start, start + colCount);
									return (
										<div
											key={virtualRow.key}
											className="grid gap-4 py-1"
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												transform: `translateY(${virtualRow.start}px)`,
												gridTemplateColumns: `repeat(${colCount}, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
											}}
										>
											{rowProjects.map((p) => (
												<ProjectCard
													key={p.id}
													project={p}
													isRecent={false}
													onOpen={() => handleOpen(p)}
													worktreeCount={p.worktreeChildren?.length}
													worktreeChildren={p.worktreeChildren}
													onOpenWorktree={handleOpen}
												/>
											))}
										</div>
									);
								})}
							</div>
						</div>
						<button
							type="button"
							onClick={onAddProject}
							className="group mt-6 flex shrink-0 items-center justify-center gap-2 self-center rounded-xl border border-dashed border-(--border-primary) bg-transparent px-8 py-3.5 text-sm font-medium text-(--text-muted) transition-all duration-200 hover:border-(--accent-primary) hover:text-(--accent-primary) hover:bg-(--bg-secondary)"
						>
							<Plus
								size={18}
								className="transition-transform duration-200 group-hover:rotate-90"
							/>
							Add another repository
						</button>
					</section>
				) : (
					<div className="flex flex-1 flex-col items-center justify-center gap-6 pt-12">
						<div className="rounded-2xl border border-dashed border-(--border-secondary) bg-(--bg-secondary) p-12 text-center">
							<p className="text-sm text-(--text-muted)">
								You’ve opened all your recent projects.
							</p>
							<p className="mt-1 text-xs text-(--text-muted)/80">
								Add more to keep working.
							</p>
							<button
								type="button"
								onClick={onAddProject}
								className="btn btn-secondary mt-6"
							>
								<Plus size={16} />
								Add repository
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
