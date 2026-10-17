import type { Language } from '#lib/languages.js';
import type { CustomerBalance } from '#lib/ledger-types.js';
import { rupees } from '#lib/format.js';

export type DuesAnswerInput = {
	/** Set when the question was about one customer. */
	customerName?: string | null;
	total: number;
	customers: CustomerBalance[];
};

/**
 * Short spoken answer (well under the 500-char TTS limit) for a "how much is due" query.
 * Pure: the numbers come from the ledger, never from the model.
 */
export function composeDuesAnswer(language: Language, input: DuesAnswerInput): string {
	const hi = language === 'hi-IN';
	const { customerName, total, customers } = input;

	if (customerName) {
		const due = customers.find((c) => c.name === customerName)?.due ?? customers[0]?.due ?? 0;
		if (due > 0) return hi ? `${customerName} का ${rupees(due)} बाकी है।` : `${customerName} owes ${rupees(due)}.`;
		if (due < 0) {
			return hi
				? `${customerName} ने ${rupees(-due)} एडवांस दिए हैं।`
				: `${customerName} has paid ${rupees(-due)} in advance.`;
		}
		return hi ? `${customerName} का कुछ बाकी नहीं है।` : `${customerName} owes nothing.`;
	}

	const owing = customers.filter((c) => c.due > 0);
	if (owing.length === 0 || total <= 0) {
		return hi ? 'किसी का कुछ बाकी नहीं है।' : 'Nobody owes anything.';
	}
	const top = owing.reduce((a, b) => (b.due > a.due ? b : a));
	if (owing.length === 1) {
		return hi ? `${top.name} का ${rupees(top.due)} बाकी है।` : `${top.name} owes ${rupees(top.due)}.`;
	}
	return hi
		? `कुल ${rupees(total)} बाकी है। सबसे ज़्यादा ${top.name} का ${rupees(top.due)}।`
		: `Total ${rupees(total)} is due. Highest is ${top.name}, ${rupees(top.due)}.`;
}
