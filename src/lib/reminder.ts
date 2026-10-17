import type { Language } from '#lib/languages.js';

export interface ReminderInput {
	customerName: string;
	/** Amount still owed, in rupees. */
	due: number;
	shopName: string;
}

const formatAmount = (due: number): string => due.toLocaleString('en-IN');

/** Builds a polite, short payment reminder in the given language. */
export function buildReminderMessage(
	language: Language,
	{ customerName, due, shopName }: ReminderInput
): string {
	const amount = formatAmount(due);
	if (language === 'hi-IN') {
		return `नमस्ते ${customerName} जी, ${shopName} से याद दिलाना था कि आपका ₹${amount} बाकी है। जब सुविधा हो, कृपया चुका दें। धन्यवाद 🙏`;
	}
	return `Hello ${customerName}, this is a friendly reminder from ${shopName} that ₹${amount} is pending on your account. Please clear it when convenient. Thank you 🙏`;
}

/**
 * Normalises a phone number to international digits (no '+').
 * Indian numbers: 10 digits gets '91' prepended; leading '0' or '00' is stripped.
 * Returns null when the result is not a plausible number.
 */
export function normalisePhone(phone: string | null): string | null {
	if (!phone) return null;
	let digits = phone.replace(/\D/g, '');
	if (digits.startsWith('00')) digits = digits.slice(2);
	else if (digits.startsWith('0')) digits = digits.slice(1);
	if (digits.length === 10) return `91${digits}`;
	if (digits.length === 12 && digits.startsWith('91')) return digits;
	return null;
}

/**
 * wa.me link with the message pre-filled. Without a valid number the link
 * has no recipient, so WhatsApp lets the shopkeeper pick the contact.
 */
export function whatsappUrl(phone: string | null, message: string): string {
	const digits = normalisePhone(phone);
	const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
	return `${base}?text=${encodeURIComponent(message)}`;
}
