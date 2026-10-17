import { chat } from '#lib/server/sarvam/chat.js';
import { parseToolCall, systemPrompt, tools, verifyPaymentMode, type Intent } from './intent.js';

export async function extractIntent(
	transcript: string,
	ctx: { language: string; customers: string[]; products: string[] }
): Promise<Intent> {
	const msg = await chat({
		messages: [
			{ role: 'system', content: systemPrompt(ctx.language, ctx.customers, ctx.products) },
			{ role: 'user', content: transcript }
		],
		tools
	});
	const call = msg.tool_calls?.[0];
	if (call) {
		const intent = parseToolCall(call.function.name, call.function.arguments);
		if (intent.kind === 'sale') intent.paymentMode = verifyPaymentMode(intent.paymentMode, transcript);
		return intent;
	}
	return msg.content?.trim() ? { kind: 'clarify', question: msg.content.trim() } : { kind: 'unknown' };
}
