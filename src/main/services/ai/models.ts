import type { AIProviderType } from "../../../shared/types.js";
import { createAIProvider, getProviderInfo } from "./index.js";

export interface FetchModelsResult {
	success: boolean;
	models: string[];
	error?: string;
}

export async function fetchModelsFromProvider(
	type: AIProviderType,
	apiKey: string,
	baseURL?: string
): Promise<FetchModelsResult> {
	if (!apiKey.trim()) {
		return { success: false, models: [], error: "API key required" };
	}

	const providerInfo = getProviderInfo(type);
	if (!providerInfo) {
		return { success: false, models: [], error: `Unknown provider type: ${type}` };
	}

	if (providerInfo.requiresBaseURL && !baseURL?.trim()) {
		return { success: false, models: [], error: "Base URL required for this provider" };
	}

	try {
		const provider = createAIProvider(type, {
			apiKey: apiKey.trim(),
			baseURL: baseURL?.trim() || undefined,
			model: "model-discovery",
		});

		const models = await provider.getAvailableModels();
		return { success: true, models };
	} catch (err) {
		return {
			success: false,
			models: [],
			error: err instanceof Error ? err.message : "Unknown error",
		};
	}
}
