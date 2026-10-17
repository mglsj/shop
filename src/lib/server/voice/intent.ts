import type { PaymentMode } from '#lib/voice-types.js';
import { parsePaymentMode } from '#lib/voice-reply.js';
import type { ToolDef } from '#lib/server/sarvam/chat.js';

export type Intent =
	| {
			kind: 'sale';
			customerName: string | null;
			items: { name: string; qty: number; unit: string | null; unitPrice: number | null }[];
			totalAmount: number | null;
			paymentMode: PaymentMode;
	  }
	| { kind: 'payment'; customerName: string | null; amount: number | null }
	| { kind: 'query'; customerName: string | null }
	| { kind: 'clarify'; question: string }
	| { kind: 'unknown' };

export const tools: ToolDef[] = [
	{
		type: 'function',
		function: {
			name: 'record_sale',
			description:
				'Shopkeeper sold items. Use for "X took/bought ...", "sold ...", "gave ... on credit/tab/udhaar".',
			parameters: {
				type: 'object',
				properties: {
					customer_name: {
						type: 'string',
						description: 'Customer name in Latin script, or omit if no customer is mentioned.'
					},
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string', description: 'Product name in Latin script, singular.' },
								qty: { type: 'number' },
								unit: { type: 'string', description: 'kg, g, litre, packet, piece, dozen, ...' },
								unit_price: { type: 'number', description: 'Only if the price per unit was said.' }
							},
							required: ['name', 'qty']
						}
					},
					total_amount: { type: 'number', description: 'Only if a total price was said.' },
					payment_mode: {
						type: 'string',
						enum: ['cash', 'tab', 'unknown'],
						description:
							'tab = on credit (udhaar, khata, likh do, baad mein). cash = paid now (cash, paid, de diya, UPI). unknown if not said.'
					}
				},
				required: ['items', 'payment_mode']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'record_payment',
			description: 'A customer paid money towards their tab/udhaar ("Sunita paid 200", "ne 200 diye").',
			parameters: {
				type: 'object',
				properties: {
					customer_name: { type: 'string', description: 'Latin script.' },
					amount: { type: 'number', description: 'Amount in rupees.' }
				},
				required: ['customer_name', 'amount']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'query_dues',
			description:
				'Shopkeeper asks how much is due ("Ramesh ka kitna baaki hai", "who owes me money"). Omit customer_name to ask about everyone.',
			parameters: {
				type: 'object',
				properties: { customer_name: { type: 'string', description: 'Latin script.' } }
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'ask_clarification',
			description: 'Use when the request is unclear or is not about sales, payments or dues.',
			parameters: {
				type: 'object',
				properties: {
					question: { type: 'string', description: 'Short question in the shopkeeper\'s language.' }
				},
				required: ['question']
			}
		}
	}
];

export function systemPrompt(language: string, customers: string[], products: string[]) {
	return `You turn a shopkeeper's spoken note into one function call for a small Indian shop's ledger.
The speech was transcribed automatically and may contain mistakes. The language is ${language === 'hi-IN' ? 'Hindi/Hinglish' : 'English (Indian)'}.

Rules:
- Always call exactly one function.
- Write customer and product names in Latin script (Ramesh, chawal), even if the transcript is in Devanagari.
- If the name sounds like one of the known customers, use that exact spelling.
- Numbers: dedh = 1.5, dhai = 2.5, sava = 1.25, savva = 1.25, aadha = 0.5, paav = 0.25, sau = 100, pachaas = 50.
- "udhaar", "khate mein", "tab", "likh do", "baad mein dega" => payment_mode "tab". "cash", "paid", "de diya", "nagad", "UPI" => "cash". Otherwise "unknown". Never infer cash from a price alone: "bought X for ₹10", "took X", "liya" or "kharida" without one of those words is "unknown".
- Never compute totals yourself. Only pass prices or totals the shopkeeper actually said.
- A customer handing over money for old dues is record_payment, not a sale.

Known customers: ${customers.length ? customers.join(', ') : '(none yet)'}
Known products: ${products.length ? products.join(', ') : '(none yet)'}`;
}

/**
 * The model tends to assume "cash" whenever a price is mentioned. A wrong guess silently loses a tab
 * entry, so cash/tab only stands if the transcript contains an explicit payment word.
 */
export function verifyPaymentMode(mode: PaymentMode, transcript: string): PaymentMode {
	return mode !== 'unknown' && parsePaymentMode(transcript) === mode ? mode : 'unknown';
}

function num(v: unknown): number | null {
	const n = typeof v === 'string' ? Number(v) : v;
	return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}
function str(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Validates model output by hand; anything malformed degrades to "unknown" rather than throwing. */
export function parseToolCall(name: string, rawArgs: string): Intent {
	let args: Record<string, unknown>;
	try {
		args = JSON.parse(rawArgs || '{}');
	} catch {
		return { kind: 'unknown' };
	}
	switch (name) {
		case 'record_sale': {
			const items = (Array.isArray(args.items) ? args.items : []).flatMap((raw) => {
				const it = raw as Record<string, unknown>;
				const itemName = str(it?.name);
				if (!itemName) return [];
				return [
					{
						name: itemName,
						qty: num(it.qty) || 1,
						unit: str(it.unit),
						unitPrice: num(it.unit_price)
					}
				];
			});
			if (!items.length) return { kind: 'unknown' };
			const mode = args.payment_mode;
			return {
				kind: 'sale',
				customerName: str(args.customer_name),
				items,
				totalAmount: num(args.total_amount),
				paymentMode: mode === 'cash' || mode === 'tab' ? mode : 'unknown'
			};
		}
		case 'record_payment':
			return { kind: 'payment', customerName: str(args.customer_name), amount: num(args.amount) };
		case 'query_dues':
			return { kind: 'query', customerName: str(args.customer_name) };
		case 'ask_clarification':
			return str(args.question)
				? { kind: 'clarify', question: str(args.question)! }
				: { kind: 'unknown' };
		default:
			return { kind: 'unknown' };
	}
}
