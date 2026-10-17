import { sarvamJson } from './client.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ToolDef = {
	type: 'function';
	function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
};

type ChatResponse = {
	choices: { message: { role: string; content: string | null; tool_calls?: ToolCall[] } }[];
};

/** OpenAI-compatible chat completions (v1). `sarvam-105b-conversations` is the low-latency 32K model. */
export async function chat(opts: {
	messages: ChatMessage[];
	tools?: ToolDef[];
	model?: 'sarvam-105b' | 'sarvam-105b-conversations';
	maxTokens?: number;
}) {
	const res = await sarvamJson<ChatResponse>('/v1/chat/completions', {
		json: {
			model: opts.model ?? 'sarvam-105b-conversations',
			messages: opts.messages,
			tools: opts.tools,
			tool_choice: opts.tools ? 'auto' : undefined,
			temperature: 0.1,
			reasoning_effort: 'low',
			max_tokens: opts.maxTokens ?? 1024
		}
	});
	return res.choices[0]?.message ?? { role: 'assistant', content: null, tool_calls: undefined };
}
