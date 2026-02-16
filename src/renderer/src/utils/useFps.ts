import { useEffect, useRef, useState, useCallback } from "react";

export interface FpsState {
	current: number;
	history: number[];
}

const HISTORY_SIZE = 60;

export function useFps(enabled: boolean): FpsState {
	const [fps, setFps] = useState<FpsState>({
		current: 0,
		history: Array.from({ length: HISTORY_SIZE }, () => 0),
	});
	const frameRef = useRef<number | undefined>(undefined);
	const lastTimeRef = useRef<number>(0);
	const frameCountRef = useRef<number>(0);
	const historyRef = useRef<number[]>(Array.from({ length: HISTORY_SIZE }, () => 0));

	const updateFps = useCallback(() => {
		const now = performance.now();
		frameCountRef.current++;

		if (lastTimeRef.current > 0) {
			const delta = now - lastTimeRef.current;

			// Update FPS every 500ms for smoother display
			if (delta >= 500) {
				const currentFps = Math.round((frameCountRef.current * 1000) / delta);

				// Update history (shift and push)
				historyRef.current = [...historyRef.current.slice(1), currentFps];

				setFps({
					current: currentFps,
					history: [...historyRef.current],
				});

				frameCountRef.current = 0;
				lastTimeRef.current = now;
			}
		} else {
			lastTimeRef.current = now;
		}

		frameRef.current = requestAnimationFrame(updateFps);
	}, []);

	useEffect(() => {
		if (!enabled) {
			// Reset when disabled
			setFps({ current: 0, history: Array.from({ length: HISTORY_SIZE }, () => 0) });
			historyRef.current = Array.from({ length: HISTORY_SIZE }, () => 0);
			frameCountRef.current = 0;
			lastTimeRef.current = 0;
			return;
		}

		frameRef.current = requestAnimationFrame(updateFps);

		return () => {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
			}
		};
	}, [enabled, updateFps]);

	return fps;
}
