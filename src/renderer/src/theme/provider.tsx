import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
	theme: Theme;
	resolved: "dark" | "light";
	setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "dark" | "light" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
	children,
	initialTheme = "system",
}: {
	children: ReactNode;
	initialTheme?: Theme;
}) {
	const [theme, setThemeState] = useState<Theme>(initialTheme);

	useEffect(() => {
		setThemeState(initialTheme);
	}, [initialTheme]);
	const [resolved, setResolved] = useState<"dark" | "light">(() =>
		theme === "system" ? getSystemTheme() : theme
	);

	useEffect(() => {
		const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
		setResolved(resolvedTheme);
		document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
	}, [theme]);

	useEffect(() => {
		if (theme !== "system") return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => setResolved(mql.matches ? "dark" : "light");
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [theme]);

	const setTheme = (t: Theme) => {
		setThemeState(t);
		window.gitagen?.settings?.setGlobal?.({ theme: t });
	};

	return (
		<ThemeContext.Provider value={{ theme, resolved, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
	return ctx;
}
