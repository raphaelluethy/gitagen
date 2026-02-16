import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";
import type {
	AIProvider,
	AIProviderConfig,
	ChatMessage,
	ChatOptions,
	ChatResult,
	StreamOptions,
} from "../types.js";

export class OpenAICompatibleProvider implements AIProvider {
	readonly id = "openai-compatible";
	readonly displayName = "OpenAI Compatible";
	readonly model: string;
	private client: ReturnType<typeof createOpenAICompatible>;
	private baseURL: string;
	private apiKey: string;

	constructor(config: AIProviderConfig) {
		if (!config.baseURL) {
			throw new Error("Base URL is required for openai-compatible provider");
		}
		this.model = config.model;
		this.baseURL = config.baseURL;
		this.apiKey = config.apiKey;
		this.client = createOpenAICompatible({
			name: "openai-compatible",
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
	}

	async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
		const result = await generateText({
			model: this.client(this.model),
			messages,
		});

		return {
			content: result.text,
			usage: result.usage
				? {
						inputTokens: result.usage.inputTokens ?? 0,
						outputTokens: result.usage.outputTokens ?? 0,
						totalTokens: result.usage.totalTokens ?? 0,
					}
				: undefined,
			finishReason: this.mapFinishReason(result.finishReason),
		};
	}

	async streamChat(messages: ChatMessage[], options: StreamOptions): Promise<ChatResult> {
		const result = streamText({
			model: this.client(this.model),
			messages,
		});

		for await (const chunk of result.textStream) {
			options.onChunk(chunk);
		}

		const [text, usage, finishReason] = await Promise.all([
			result.text,
			result.usage,
			result.finishReason,
		]);

		return {
			content: text,
			usage: usage
				? {
						inputTokens: usage.inputTokens ?? 0,
						outputTokens: usage.outputTokens ?? 0,
						totalTokens: usage.totalTokens ?? 0,
					}
				: undefined,
			finishReason: this.mapFinishReason(finishReason),
		};
	}

	async getAvailableModels(): Promise<string[]> {
		const url = this.baseURL.endsWith("/") ? `${this.baseURL}models` : `${this.baseURL}/models`;
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status}`);
		}

		const data = (await response.json()) as { data: { id: string }[] };
		return data.data.map((m) => m.id).sort((a, b) => a.localeCompare(b));
	}

	private mapFinishReason(reason: string | undefined): ChatResult["finishReason"] {
		switch (reason) {
			case "stop":
				return "stop";
			case "length":
				return "length";
			case "content-filter":
				return "content-filter";
			default:
				return "unknown";
		}
	}
}
