import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createCerebras } from "@ai-sdk/cerebras";
import { createFireworks } from "@ai-sdk/fireworks";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { AIProviderInstance } from "../../../shared/types";

export function createModelFromSettings(provider: AIProviderInstance): LanguageModel {
	switch (provider.type) {
		case "openai":
			return createOpenAI({ apiKey: provider.apiKey })(provider.defaultModel);
		case "openrouter":
			return createOpenRouter({
				apiKey: provider.apiKey,
				compatibility: "strict",
			})(provider.defaultModel);
		case "openai-compatible": {
			if (!provider.baseURL) {
				throw new Error("Base URL is required for openai-compatible provider");
			}
			return createOpenAICompatible({
				name: "openai-compatible",
				apiKey: provider.apiKey,
				baseURL: provider.baseURL,
			})(provider.defaultModel);
		}
		case "cerebras":
			return createCerebras({
				apiKey: provider.apiKey,
			})(provider.defaultModel);
		case "fireworks":
			return createFireworks({
				apiKey: provider.apiKey,
			})(provider.defaultModel);
		default:
			throw new Error(`Unknown AI provider type: ${provider.type}`);
	}
}
