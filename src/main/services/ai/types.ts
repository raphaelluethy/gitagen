export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatOptions {
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	stopSequences?: string[];
}

export interface ChatUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface ChatResult {
	content: string;
	usage?: ChatUsage;
	finishReason?: "stop" | "length" | "content-filter" | "unknown";
}

export interface StreamOptions extends ChatOptions {
	onChunk: (chunk: string) => void;
}

export interface AIProviderConfig {
	apiKey: string;
	baseURL?: string;
	model: string;
}

export interface AIProvider {
	readonly id: string;
	readonly displayName: string;
	readonly model: string;

	chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
	streamChat(messages: ChatMessage[], options: StreamOptions): Promise<ChatResult>;
	getAvailableModels(): Promise<string[]>;
}
