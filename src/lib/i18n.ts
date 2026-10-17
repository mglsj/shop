import type { Language } from '#lib/languages.js';

export const LANGUAGE_LABELS: Record<Language, { native: string; english: string }> = {
	'hi-IN': { native: 'हिन्दी', english: 'Hindi' },
	'en-IN': { native: 'English', english: 'English' }
};

const base = {
	'en-IN': {
		'onboarding.welcome': 'Welcome to Voice Khata',
		'onboarding.language': 'Which language do you speak?',
		'onboarding.shopName': 'Shop name',
		'onboarding.shopNamePlaceholder': 'e.g. Sharma General Store',
		'onboarding.start': 'Start',
		'nav.home': 'Home',
		'home.settings': 'Change language or shop name',
		'nav.tabs': 'Udhaar',
		'nav.inventory': 'Stock',
		'nav.import': 'Scan',
		'home.greeting': 'Namaste',
		'home.tagline': 'Speak to record sales and udhaar.',
		'voice.tap': 'Tap and speak',
		'voice.recording': 'Listening… tap to stop',
		'voice.processing': 'Understanding…',
		'voice.error.mic': 'Could not use the microphone. Please allow access.',
		'voice.error.generic': 'Something went wrong. Please try again.',
		'voice.error.noKey': 'Voice is not set up yet (missing API key).',
		'voice.nothingHeard': 'I did not hear anything. Try again.',
		'draft.heard': 'I heard',
		'draft.sale': 'Sale',
		'draft.payment': 'Payment received',
		'draft.query': 'Dues',
		'draft.clarify': 'Need more information',
		'draft.unknown': 'I could not understand. Try again.',
		'draft.customer': 'Customer',
		'draft.noCustomer': 'No customer',
		'draft.total': 'Total',
		'draft.cash': 'Paid (cash)',
		'draft.tab': 'On tab (udhaar)',
		'draft.mode.unknown': 'Cash or tab?',
		'draft.dismiss': 'Dismiss',
		'draft.maybe': 'Did you mean',
		'issue.payment_mode': 'Was it paid or on tab?',
		'issue.customer_required': 'Which customer is this tab for?',
		'issue.customer_new': 'This customer is not saved yet. Add as new?',
		'issue.customer_ambiguous': 'Which customer is this?',
		'issue.amount_missing': 'What is the amount?',
		'issue.product_new': 'New item, price unknown.'
	},
	'hi-IN': {
		'onboarding.welcome': 'वॉइस खाता में आपका स्वागत है',
		'onboarding.language': 'आप कौन सी भाषा बोलते हैं?',
		'onboarding.shopName': 'दुकान का नाम',
		'onboarding.shopNamePlaceholder': 'जैसे शर्मा जनरल स्टोर',
		'onboarding.start': 'शुरू करें',
		'nav.home': 'होम',
		'home.settings': 'भाषा या दुकान का नाम बदलें',
		'nav.tabs': 'उधार',
		'nav.inventory': 'सामान',
		'nav.import': 'स्कैन',
		'home.greeting': 'नमस्ते',
		'home.tagline': 'बोलकर बिक्री और उधार दर्ज करें।',
		'voice.tap': 'दबाएँ और बोलें',
		'voice.recording': 'सुन रहा हूँ… रोकने के लिए दबाएँ',
		'voice.processing': 'समझ रहा हूँ…',
		'voice.error.mic': 'माइक्रोफ़ोन इस्तेमाल नहीं हो सका। कृपया अनुमति दें।',
		'voice.error.generic': 'कुछ गड़बड़ हो गई। फिर कोशिश करें।',
		'voice.error.noKey': 'आवाज़ अभी सेट नहीं है (API key नहीं मिली)।',
		'voice.nothingHeard': 'कुछ सुनाई नहीं दिया। फिर बोलें।',
		'draft.heard': 'मैंने सुना',
		'draft.sale': 'बिक्री',
		'draft.payment': 'पैसे मिले',
		'draft.query': 'बाकी रकम',
		'draft.clarify': 'और जानकारी चाहिए',
		'draft.unknown': 'समझ नहीं आया। फिर बोलें।',
		'draft.customer': 'ग्राहक',
		'draft.noCustomer': 'कोई ग्राहक नहीं',
		'draft.total': 'कुल',
		'draft.cash': 'नकद (चुकता)',
		'draft.tab': 'उधार',
		'draft.mode.unknown': 'नकद या उधार?',
		'draft.dismiss': 'हटाएँ',
		'draft.maybe': 'क्या आपका मतलब है',
		'issue.payment_mode': 'पैसे मिल गए या उधार?',
		'issue.customer_required': 'उधार किस ग्राहक का है?',
		'issue.customer_new': 'यह ग्राहक सेव नहीं है। नया जोड़ें?',
		'issue.customer_ambiguous': 'कौन सा ग्राहक?',
		'issue.amount_missing': 'रकम कितनी है?',
		'issue.product_new': 'नया सामान, दाम पता नहीं।'
	}
} as const satisfies Record<Language, Record<string, string>>;

import tabs from './i18n/tabs.js';
import clarify from './i18n/clarify.js';
import reminder from './i18n/reminder.js';
import importer from './i18n/import.js';
import inventory from './i18n/inventory.js';

const modules = [tabs, clarify, reminder, importer, inventory];
const merge = (lang: Language) => Object.assign({}, base[lang], ...modules.map((m) => m[lang]));

const en = merge('en-IN') as (typeof base)['en-IN'] & (typeof tabs)['en-IN'] & (typeof clarify)['en-IN'] & (typeof reminder)['en-IN'] & (typeof importer)['en-IN'] & (typeof inventory)['en-IN'];
export type MessageKey = keyof typeof en;

// Typed so that every key defined for English must exist for Hindi.
const dict: Record<Language, Record<MessageKey, string>> = {
	'en-IN': en,
	'hi-IN': merge('hi-IN') as Record<MessageKey, string>
};

export function t(lang: Language, key: MessageKey): string {
	return dict[lang][key];
}

/** Exposed for tests (en/hi key parity). */
export const dictionaries = dict;
