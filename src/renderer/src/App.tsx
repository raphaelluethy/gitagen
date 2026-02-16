import { useState, useEffect } from "react";
import { Rows3, Columns } from "lucide-react";
import Sidebar from "./components/Sidebar";
import DiffViewer from "./components/DiffViewer";
import type { GitStatus, GitFileStatus, DiffStyle } from "../../shared/types";

function App() {
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
	const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		window.api
			.getStatus()
			.then((s) => {
				setStatus(s);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, []);

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
				Loading...
			</div>
		);
	}

	if (!status) {
		return (
			<div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
				Not a git repository. Open this app from a git repo directory.
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
			<div className="flex flex-1 min-h-0">
				<Sidebar status={status} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
				<main className="flex min-w-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
						<button
							type="button"
							onClick={() => setDiffStyle("unified")}
							title="Stacked"
							className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
								diffStyle === "unified"
									? "bg-zinc-700 text-white"
									: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
							}`}
						>
							<Rows3 size={14} />
							Stacked
						</button>
						<button
							type="button"
							onClick={() => setDiffStyle("split")}
							title="Side by side"
							className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
								diffStyle === "split"
									? "bg-zinc-700 text-white"
									: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
							}`}
						>
							<Columns size={14} />
							Side by side
						</button>
					</div>
					<DiffViewer
						repoPath={status.repoPath}
						selectedFile={selectedFile}
						diffStyle={diffStyle}
					/>
				</main>
			</div>
		</div>
	);
}

export default App;
