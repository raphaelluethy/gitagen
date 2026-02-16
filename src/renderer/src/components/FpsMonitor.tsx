import { useFps } from "../utils/useFps";

interface FpsMonitorProps {
	enabled: boolean;
}

export function FpsMonitor({ enabled }: FpsMonitorProps) {
	const { current, history } = useFps(enabled);

	if (!enabled) return null;

	const maxFps = Math.max(...history, 60);
	const barWidth = 3;
	const barGap = 1;

	return (
		<div
			style={{
				position: "fixed",
				bottom: "12px",
				right: "12px",
				backgroundColor: "var(--bg-panel)",
				border: "1px solid var(--border-secondary)",
				borderRadius: "var(--radius-lg)",
				padding: "8px 12px",
				boxShadow: "var(--shadow-md)",
				zIndex: 9999,
				display: "flex",
				flexDirection: "column",
				gap: "6px",
				minWidth: "120px",
			}}
		>
			{/* FPS Number Display */}
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					gap: "4px",
					fontFamily: "var(--font-mono)",
				}}
			>
				<span
					style={{
						fontSize: "18px",
						fontWeight: 600,
						color:
							current >= 55
								? "var(--success)"
								: current >= 30
									? "var(--warning)"
									: "var(--danger)",
					}}
				>
					{current}
				</span>
				<span
					style={{
						fontSize: "10px",
						color: "var(--text-muted)",
						textTransform: "uppercase",
					}}
				>
					FPS
				</span>
			</div>

			{/* Bar Chart History */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					gap: `${barGap}px`,
					height: "32px",
				}}
			>
				{history.map((fps, index) => {
					const height = maxFps > 0 ? (fps / maxFps) * 32 : 0;
					const color =
						fps >= 55
							? "var(--success)"
							: fps >= 30
								? "var(--warning)"
								: "var(--danger)";

					return (
						<div
							key={index}
							style={{
								width: `${barWidth}px`,
								height: `${Math.max(height, 2)}px`,
								backgroundColor: color,
								borderRadius: "1px",
								opacity: index > history.length - 20 ? 1 : 0.4,
							}}
						/>
					);
				})}
			</div>
		</div>
	);
}
