import { useState, useEffect, memo } from "react";
import { getGravatarUrl } from "../utils/gravatar";

interface GravatarAvatarProps {
	email: string;
	name: string;
	size?: number;
	className?: string;
}

function getInitials(name: string): string {
	return (
		name
			.split(/\s+/)
			.map((s) => s[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

export default memo(function GravatarAvatar({
	email,
	name,
	size = 32,
	className = "",
}: GravatarAvatarProps) {
	const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!email) {
			setGravatarUrl(null);
			setFailed(false);
			return;
		}
		setFailed(false);
		let cancelled = false;
		getGravatarUrl(email, size * 2)
			.then((url) => {
				if (!cancelled) setGravatarUrl(url);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [email, size]);

	const initials = getInitials(name);
	const pixelSize = size;

	if (gravatarUrl && !failed) {
		return (
			<img
				src={gravatarUrl}
				alt=""
				width={pixelSize}
				height={pixelSize}
				className={`shrink-0 rounded-full object-cover ${className}`}
				onError={() => setFailed(true)}
			/>
		);
	}

	return (
		<div
			className={`flex shrink-0 items-center justify-center rounded-full bg-(--bg-tertiary) text-[11px] font-medium text-(--text-muted) ${className}`}
			style={{ width: pixelSize, height: pixelSize }}
		>
			{initials}
		</div>
	);
});
