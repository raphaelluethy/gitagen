import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search, TriangleAlert } from "lucide-react";
import { matchLabelWithKeywords, type FuzzyMatch } from "../lib/fuzzyMatch";
import { Dialog, DialogContent } from "./ui/dialog";
import type {
	CommandConfirm,
	CommandInputSpec,
	CommandItem,
	CommandSubItem,
} from "../hooks/useCommandRegistry";

type RootStep = {
	kind: "root";
	query: string;
	activeIndex: number;
};

type DrilldownStep = {
	kind: "drilldown";
	query: string;
	activeIndex: number;
	command: CommandItem;
	items: CommandSubItem[];
	loading: boolean;
};

type InputStep = {
	kind: "input";
	command: CommandItem;
	spec: CommandInputSpec;
	value: string;
	error: string | null;
};

type BaseStep = RootStep | DrilldownStep | InputStep;

type ConfirmStep = {
	kind: "confirm";
	confirm: CommandConfirm;
	run: () => Promise<void> | void;
	previous: BaseStep;
	busy: boolean;
};

type PaletteStep = BaseStep | ConfirmStep;

type RootMatch = {
	command: CommandItem;
	match: FuzzyMatch;
};

type GroupedRootMatch = {
	entry: RootMatch;
	uiIndex: number;
};

type SubMatch = {
	item: CommandSubItem;
	match: FuzzyMatch;
};

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
	return (
		<span className="command-palette-hint">
			<kbd>{keys}</kbd>
			<span>{label}</span>
		</span>
	);
}

function sortByScore<T extends { match: FuzzyMatch; label: string }>(entries: T[]): T[] {
	return [...entries].sort((a, b) => {
		if (a.match.score !== b.match.score) return b.match.score - a.match.score;
		return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
	});
}

function renderHighlightedText(text: string, indices: number[]): ReactNode {
	if (indices.length === 0) return text;
	const parts: ReactNode[] = [];
	let cursor = 0;
	for (const index of indices) {
		if (index > cursor) {
			parts.push(<span key={`plain-${cursor}-${index}`}>{text.slice(cursor, index)}</span>);
		}
		parts.push(
			<span key={`hl-${index}`} className="command-palette-highlight">
				{text[index]}
			</span>
		);
		cursor = index + 1;
	}
	if (cursor < text.length) {
		parts.push(<span key={`tail-${cursor}`}>{text.slice(cursor)}</span>);
	}
	return parts;
}

function nextEnabledIndex<T extends { disabled?: boolean }>(
	items: T[],
	startIndex: number,
	delta: number
): number {
	if (items.length === 0) return -1;
	let index = startIndex;
	for (let i = 0; i < items.length; i += 1) {
		index = (index + delta + items.length) % items.length;
		if (!items[index]?.disabled) return index;
	}
	return -1;
}

function clampIndex(index: number, maxLength: number): number {
	if (maxLength <= 0) return -1;
	if (index < 0) return 0;
	if (index >= maxLength) return maxLength - 1;
	return index;
}

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
	commands: CommandItem[];
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
	const [step, setStep] = useState<PaletteStep>({ kind: "root", query: "", activeIndex: 0 });
	const panelRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const valueInputRef = useRef<HTMLInputElement>(null);
	const confirmButtonRef = useRef<HTMLButtonElement>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!open) return;
		setStep({ kind: "root", query: "", activeIndex: 0 });
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (step.kind === "root" || step.kind === "drilldown") {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
			return;
		}
		if (step.kind === "input") {
			valueInputRef.current?.focus();
			valueInputRef.current?.select();
			return;
		}
		if (step.kind === "confirm") {
			confirmButtonRef.current?.focus();
		}
	}, [open, step]);

	useEffect(() => {
		if (!open) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			const container = panelRef.current;
			if (!container) return;
			const focusables = Array.from(
				container.querySelectorAll<HTMLElement>(
					'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => !el.hasAttribute("disabled"));
			if (focusables.length === 0) return;
			const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
			if (event.shiftKey) {
				if (currentIndex <= 0) {
					event.preventDefault();
					focusables[focusables.length - 1]?.focus();
				}
				return;
			}
			if (currentIndex === focusables.length - 1) {
				event.preventDefault();
				focusables[0]?.focus();
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => document.removeEventListener("keydown", handler, true);
	}, [open]);

	const rootMatches: RootMatch[] = useMemo(() => {
		if (step.kind !== "root") return [];
		const query = step.query.trim();
		if (!query) {
			return commands.map((command) => ({
				command,
				match: { score: 0, indices: [] },
			}));
		}
		const entries: RootMatch[] = [];
		for (const command of commands) {
			const match = matchLabelWithKeywords(query, command.label, command.keywords);
			if (!match) continue;
			entries.push({ command, match });
		}
		return sortByScore(
			entries.map((entry) => ({
				...entry,
				label: entry.command.label,
			}))
		).map(({ label: _label, ...entry }) => entry);
	}, [commands, step]);

	const drillMatches: SubMatch[] = useMemo(() => {
		if (step.kind !== "drilldown") return [];
		const query = step.query.trim();
		if (!query) {
			return step.items.map((item) => ({ item, match: { score: 0, indices: [] } }));
		}
		const entries: SubMatch[] = [];
		for (const item of step.items) {
			const match = matchLabelWithKeywords(query, item.label, item.keywords ?? []);
			if (!match) continue;
			entries.push({ item, match });
		}
		return sortByScore(
			entries.map((entry) => ({
				...entry,
				label: entry.item.label,
			}))
		).map(({ label: _label, ...entry }) => entry);
	}, [step]);

	useEffect(() => {
		if (step.kind !== "drilldown") return;
		setStep((prev) => {
			if (prev.kind !== "drilldown") return prev;
			const nextActive = clampIndex(prev.activeIndex, drillMatches.length);
			if (nextActive === prev.activeIndex) return prev;
			return { ...prev, activeIndex: nextActive };
		});
	}, [drillMatches.length, step.kind]);

	const groupedRoot = useMemo(() => {
		if (step.kind !== "root") return [];
		const groups = new Map<string, RootMatch[]>();
		for (const entry of rootMatches) {
			const category = entry.command.category;
			const list = groups.get(category);
			if (list) list.push(entry);
			else groups.set(category, [entry]);
		}
		const result: Array<[string, GroupedRootMatch[]]> = [];
		let uiIndex = 0;
		for (const [category, entries] of groups.entries()) {
			result.push([
				category,
				entries.map((entry) => {
					const next: GroupedRootMatch = { entry, uiIndex };
					uiIndex += 1;
					return next;
				}),
			]);
		}
		return result;
	}, [rootMatches, step.kind]);

	const rootVisibleMatches: RootMatch[] = useMemo(() => {
		if (step.kind !== "root") return [];
		return groupedRoot.flatMap(([, entries]) => entries.map(({ entry }) => entry));
	}, [groupedRoot, step.kind]);

	useEffect(() => {
		if (step.kind !== "root") return;
		setStep((prev) => {
			if (prev.kind !== "root") return prev;
			const nextActive = clampIndex(prev.activeIndex, rootVisibleMatches.length);
			if (nextActive === prev.activeIndex) return prev;
			return { ...prev, activeIndex: nextActive };
		});
	}, [rootVisibleMatches.length, step.kind]);

	const activeRoot = step.kind === "root" ? (rootVisibleMatches[step.activeIndex] ?? null) : null;
	const activeSub = step.kind === "drilldown" ? (drillMatches[step.activeIndex] ?? null) : null;

	const activeDescription =
		step.kind === "root"
			? activeRoot?.command.description
			: step.kind === "drilldown"
				? (activeSub?.item.detail ?? step.command.description)
				: step.kind === "input"
					? step.command.description
					: step.confirm.detail;

	const activeListIndex =
		step.kind === "root" || step.kind === "drilldown" ? step.activeIndex : -1;

	useEffect(() => {
		if (step.kind !== "root" && step.kind !== "drilldown") return;
		const container = panelRef.current?.querySelector<HTMLElement>(".command-palette-list");
		if (!container) return;
		const activeItem = container.querySelector<HTMLElement>(
			'.command-palette-item[data-active="true"]'
		);
		if (!activeItem) return;
		activeItem.scrollIntoView({ block: "nearest" });
	}, [step.kind, activeListIndex]);

	const closePalette = () => {
		onClose();
	};

	const runCommand = async (run: (() => Promise<void> | void) | undefined) => {
		if (!run) return;
		try {
			await Promise.resolve(run());
			closePalette();
		} catch {
			// errors are surfaced by command actions
		}
	};

	const enterConfirm = (
		confirm: CommandConfirm,
		run: () => Promise<void> | void,
		previous: BaseStep
	) => {
		setStep({ kind: "confirm", confirm, run, previous, busy: false });
	};

	const openDrilldown = async (command: CommandItem) => {
		if (!command.getSubItems) return;
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setStep({
			kind: "drilldown",
			query: "",
			activeIndex: 0,
			command,
			items: [],
			loading: true,
		});
		try {
			const items = await command.getSubItems();
			if (requestIdRef.current !== requestId) return;
			setStep((prev) => {
				if (prev.kind !== "drilldown") return prev;
				return {
					...prev,
					items,
					loading: false,
					activeIndex: items.length > 0 ? 0 : -1,
				};
			});
		} catch {
			if (requestIdRef.current !== requestId) return;
			setStep((prev) => {
				if (prev.kind !== "drilldown") return prev;
				return { ...prev, loading: false, items: [], activeIndex: -1 };
			});
		}
	};

	const enterInput = (command: CommandItem, spec: CommandInputSpec) => {
		setStep({
			kind: "input",
			command,
			spec,
			value: spec.initialValue ?? "",
			error: null,
		});
	};

	const selectRoot = async (root: RootMatch | null) => {
		if (!root) return;
		if (root.command.disabled) return;
		if (root.command.getSubItems) {
			await openDrilldown(root.command);
			return;
		}
		if (root.command.input) {
			enterInput(root.command, root.command.input);
			return;
		}
		if (root.command.confirm && root.command.run) {
			enterConfirm(root.command.confirm, root.command.run, {
				kind: "root",
				query: step.kind === "root" ? step.query : "",
				activeIndex: step.kind === "root" ? step.activeIndex : 0,
			});
			return;
		}
		await runCommand(root.command.run);
	};

	const selectSub = async (sub: SubMatch | null) => {
		if (!sub || step.kind !== "drilldown") return;
		if (sub.item.disabled) return;
		if (sub.item.confirm) {
			enterConfirm(sub.item.confirm, sub.item.run, step);
			return;
		}
		await runCommand(sub.item.run);
	};

	const submitInput = async () => {
		if (step.kind !== "input") return;
		const validationError = step.spec.validate?.(step.value) ?? null;
		if (validationError) {
			setStep({ ...step, error: validationError });
			return;
		}
		await runCommand(() => step.spec.run(step.value));
	};

	const handleBack = () => {
		if (step.kind === "confirm") {
			setStep(step.previous);
			return;
		}
		if (step.kind === "drilldown" || step.kind === "input") {
			setStep({ kind: "root", query: "", activeIndex: 0 });
			return;
		}
		closePalette();
	};

	const handleListKeyDown = async (event: React.KeyboardEvent<HTMLElement>) => {
		if (step.kind !== "root" && step.kind !== "drilldown") return;
		const list = step.kind === "root" ? rootVisibleMatches : drillMatches;
		if (event.key === "Escape") {
			event.preventDefault();
			handleBack();
			return;
		}
		if (event.key === "Backspace" && step.query.trim() === "" && step.kind === "drilldown") {
			event.preventDefault();
			handleBack();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (step.kind === "root") {
				await selectRoot(activeRoot);
				return;
			}
			await selectSub(activeSub);
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const delta = event.key === "ArrowDown" ? 1 : -1;
			const candidates =
				step.kind === "root"
					? rootVisibleMatches.map((entry) => ({ disabled: entry.command.disabled }))
					: drillMatches.map((entry) => ({ disabled: entry.item.disabled }));
			const next = nextEnabledIndex(candidates, step.activeIndex, delta);
			if (next < 0) return;
			setStep((prev) => {
				if (prev.kind !== step.kind) return prev;
				return { ...prev, activeIndex: next };
			});
			return;
		}
		if (event.key === "Home") {
			event.preventDefault();
			setStep((prev) => {
				if (prev.kind !== step.kind) return prev;
				return { ...prev, activeIndex: 0 };
			});
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			setStep((prev) => {
				if (prev.kind !== step.kind) return prev;
				return { ...prev, activeIndex: list.length - 1 };
			});
			return;
		}
		if (event.key === "PageDown" || event.key === "PageUp") {
			event.preventDefault();
			const jump = event.key === "PageDown" ? 8 : -8;
			setStep((prev) => {
				if (prev.kind !== step.kind) return prev;
				const nextIndex = clampIndex(prev.activeIndex + jump, list.length);
				return { ...prev, activeIndex: nextIndex };
			});
		}
	};

	const isListStep = step.kind === "root" || step.kind === "drilldown";
	const isInputStep = step.kind === "input";
	const isConfirmStep = step.kind === "confirm";
	const listResultCount =
		step.kind === "root"
			? rootVisibleMatches.length
			: step.kind === "drilldown"
				? drillMatches.length
				: 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) closePalette();
			}}
		>
			<DialogContent
				unstyled
				showCloseButton={false}
				overlayClassName="command-palette-backdrop"
				className="command-palette-content command-palette-panel"
				data-step={step.kind}
				ref={panelRef}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					requestAnimationFrame(() => {
						searchInputRef.current?.focus();
						searchInputRef.current?.select();
					});
				}}
				onEscapeKeyDown={(event) => {
					event.preventDefault();
					handleBack();
				}}
				onKeyDownCapture={(event) => {
					const target = event.target as HTMLElement | null;
					if (
						target instanceof HTMLInputElement ||
						target instanceof HTMLTextAreaElement
					) {
						return;
					}
					void handleListKeyDown(event);
				}}
			>
				{(step.kind === "root" || step.kind === "drilldown") && (
					<>
						<div className="command-palette-search-row">
							{step.kind === "drilldown" ? (
								<button
									type="button"
									className="command-palette-back"
									onClick={handleBack}
								>
									<ArrowLeft size={14} />
									<span>{step.command.label}</span>
								</button>
							) : (
								<div className="command-palette-title">
									<Search size={14} />
									<span>Command Palette</span>
								</div>
							)}
							<input
								ref={searchInputRef}
								value={step.query}
								onChange={(event) => {
									const query = event.target.value;
									setStep((prev) => {
										if (prev.kind !== step.kind) return prev;
										return { ...prev, query, activeIndex: 0 };
									});
								}}
								onKeyDown={(event) => {
									void handleListKeyDown(event);
								}}
								placeholder={
									step.kind === "root" ? "Type a command…" : "Filter items…"
								}
								className="command-palette-search"
							/>
							<span className="command-palette-meta">
								{step.kind === "root"
									? `${listResultCount} commands`
									: `${listResultCount} items`}
							</span>
						</div>
						<div className="command-palette-results">
							<div className="command-palette-list" role="listbox">
								{step.kind === "root" && rootVisibleMatches.length === 0 && (
									<div className="command-palette-empty">
										No matching commands
									</div>
								)}
								{step.kind === "root" &&
									groupedRoot.map(([category, matches]) => (
										<div key={category} className="command-palette-group">
											<p className="section-title command-palette-group-title">
												{category}
											</p>
											{matches.map(({ entry, uiIndex }) => {
												const isActive = uiIndex === step.activeIndex;
												return (
													<button
														key={`${entry.command.id}-${uiIndex}`}
														type="button"
														className="command-palette-item"
														data-active={isActive}
														data-disabled={
															entry.command.disabled
																? "true"
																: "false"
														}
														onMouseMove={() => {
															setStep((prev) => {
																if (prev.kind !== "root")
																	return prev;
																return {
																	...prev,
																	activeIndex: uiIndex,
																};
															});
														}}
														onClick={() => {
															void selectRoot(entry);
														}}
													>
														<div className="command-palette-item-main">
															<p className="command-palette-item-label">
																{renderHighlightedText(
																	entry.command.label,
																	entry.match.indices
																)}
															</p>
															<p className="command-palette-item-detail">
																{entry.command.disabled
																	? entry.command
																			.disabledReason ||
																		"Unavailable"
																	: entry.command.description}
															</p>
														</div>
														{(entry.command.getSubItems ||
															entry.command.input) && (
															<ArrowRight
																size={14}
																className="command-palette-arrow"
															/>
														)}
													</button>
												);
											})}
										</div>
									))}

								{step.kind === "drilldown" && step.loading && (
									<div className="command-palette-empty">Loading…</div>
								)}
								{step.kind === "drilldown" &&
									!step.loading &&
									drillMatches.length === 0 && (
										<div className="command-palette-empty">
											No matching items
										</div>
									)}
								{step.kind === "drilldown" &&
									drillMatches.map((entry, index) => (
										<button
											key={`${entry.item.id}-${index}`}
											type="button"
											className="command-palette-item"
											data-active={index === step.activeIndex}
											data-disabled={entry.item.disabled ? "true" : "false"}
											onMouseMove={() => {
												setStep((prev) => {
													if (prev.kind !== "drilldown") return prev;
													return { ...prev, activeIndex: index };
												});
											}}
											onClick={() => {
												void selectSub(entry);
											}}
										>
											<div className="command-palette-item-main">
												<p className="command-palette-item-label">
													{renderHighlightedText(
														entry.item.label,
														entry.match.indices
													)}
												</p>
												<p className="command-palette-item-detail">
													{entry.item.disabled
														? entry.item.disabledReason || "Unavailable"
														: entry.item.detail}
												</p>
											</div>
											{entry.item.badge && (
												<span className="command-palette-badge">
													{entry.item.badge}
												</span>
											)}
										</button>
									))}
							</div>
							<div className="command-palette-description">
								<p className="section-title">Details</p>
								<p className="command-palette-description-text">
									{activeDescription || ""}
								</p>
							</div>
						</div>
					</>
				)}

				{step.kind === "input" && (
					<div className="command-palette-input-step">
						<div className="command-palette-input-head">
							<button
								type="button"
								className="command-palette-back"
								onClick={handleBack}
							>
								<ArrowLeft size={14} />
								<span>{step.spec.title}</span>
							</button>
						</div>
						<div className="command-palette-input-body">
							<input
								ref={valueInputRef}
								value={step.value}
								onChange={(event) => {
									setStep((prev) => {
										if (prev.kind !== "input") return prev;
										return { ...prev, value: event.target.value, error: null };
									});
								}}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										event.preventDefault();
										handleBack();
										return;
									}
									if (event.key === "Enter") {
										event.preventDefault();
										void submitInput();
										return;
									}
									if (event.key === "Backspace" && step.value.trim() === "") {
										event.preventDefault();
										handleBack();
									}
								}}
								placeholder={step.spec.placeholder}
								className="command-palette-search"
							/>
							{step.error && <p className="command-palette-error">{step.error}</p>}
							<div className="command-palette-actions">
								<button
									type="button"
									className="btn btn-secondary"
									onClick={handleBack}
								>
									Cancel
								</button>
								<button
									type="button"
									className="btn btn-primary"
									onClick={() => {
										void submitInput();
									}}
								>
									{step.spec.submitLabel ?? "Run"}
								</button>
							</div>
						</div>
					</div>
				)}

				{step.kind === "confirm" && (
					<div
						className="command-palette-confirm-step"
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								handleBack();
								return;
							}
							if (event.key === "Enter") {
								event.preventDefault();
								confirmButtonRef.current?.click();
							}
						}}
					>
						<div
							className="command-palette-confirm-icon"
							data-danger={step.confirm.danger ? "true" : "false"}
						>
							<TriangleAlert size={18} />
						</div>
						<h3 className="command-palette-confirm-title">{step.confirm.title}</h3>
						{step.confirm.detail && (
							<p className="command-palette-confirm-detail">{step.confirm.detail}</p>
						)}
						<div className="command-palette-actions">
							<button
								type="button"
								className="btn btn-secondary"
								onClick={handleBack}
								disabled={step.busy}
							>
								Cancel
							</button>
							<button
								type="button"
								ref={confirmButtonRef}
								className={
									step.confirm.danger ? "btn btn-danger" : "btn btn-primary"
								}
								onClick={() => {
									setStep((prev) => {
										if (prev.kind !== "confirm") return prev;
										return { ...prev, busy: true };
									});
									void runCommand(step.run).finally(() => {
										setStep((prev) => {
											if (prev.kind !== "confirm") return prev;
											return { ...prev, busy: false };
										});
									});
								}}
								disabled={step.busy}
							>
								{step.confirm.confirmLabel ?? "Confirm"}
							</button>
						</div>
					</div>
				)}
				<div className="command-palette-footer" aria-hidden="true">
					{isListStep && (
						<>
							<ShortcutHint keys="↑ ↓" label="Navigate" />
							<ShortcutHint keys="↵" label="Open" />
							<ShortcutHint keys="Esc" label="Close / Back" />
						</>
					)}
					{isInputStep && (
						<>
							<ShortcutHint keys="↵" label="Run" />
							<ShortcutHint keys="Esc" label="Back" />
						</>
					)}
					{isConfirmStep && (
						<>
							<ShortcutHint keys="↵" label="Confirm" />
							<ShortcutHint keys="Esc" label="Cancel" />
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
