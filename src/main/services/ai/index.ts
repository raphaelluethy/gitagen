import { OpenAIProvider } from "./providers/openai.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";
import { CerebrasProvider } from "./providers/cerebras.js";
import { FireworksProvider } from "./providers/fireworks.js";
import type { AIProvider, AIProviderConfig } from "./types.js";

export interface ProviderInfo {
	id: string;
	displayName: string;
	requiresBaseURL: boolean;
}

interface ProviderEntry extends ProviderInfo {
	create: (config: AIProviderConfig) => AIProvider;
}

const PROVIDERS: Record<string, ProviderEntry> = {
	openai: {
		id: "openai",
		displayName: "OpenAI",
		requiresBaseURL: false,
		create: (config) => new OpenAIProvider(config),
	},
	openrouter: {
		id: "openrouter",
		displayName: "OpenRouter",
		requiresBaseURL: false,
		create: (config) => new OpenRouterProvider(config),
	},
	"openai-compatible": {
		id: "openai-compatible",
		displayName: "OpenAI Compatible",
		requiresBaseURL: true,
		create: (config) => new OpenAICompatibleProvider(config),
	},
	cerebras: {
		id: "cerebras",
		displayName: "Cerebras",
		requiresBaseURL: false,
		create: (config) => new CerebrasProvider(config),
	},
	fireworks: {
		id: "fireworks",
		displayName: "Fireworks",
		requiresBaseURL: false,
		create: (config) => new FireworksProvider(config),
	},
};

export function getProviderInfo(id: string): ProviderInfo | undefined {
	const provider = PROVIDERS[id];
	if (!provider) return undefined;
	return {
		id: provider.id,
		displayName: provider.displayName,
		requiresBaseURL: provider.requiresBaseURL,
	};
}

export function getAllProviders(): ProviderInfo[] {
	return Object.values(PROVIDERS).map((provider) => ({
		id: provider.id,
		displayName: provider.displayName,
		requiresBaseURL: provider.requiresBaseURL,
	}));
}

export function createAIProvider(id: string, config: AIProviderConfig): AIProvider {
	const provider = PROVIDERS[id];
	if (!provider) {
		throw new Error(`Unknown AI provider: ${id}`);
	}
	return provider.create(config);
}

export function isProviderKnown(id: string): boolean {
	return Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

export type {
	AIProvider,
	AIProviderConfig,
	ChatMessage,
	ChatOptions,
	ChatResult,
	ChatUsage,
	StreamOptions,
} from "./types.js";
