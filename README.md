# Voice Khata

A voice-first ledger for Indian shopkeepers. Instead of writing udhaar (credit) entries in a notebook, the shopkeeper speaks in Hindi or English: "Ramesh ne do kilo chawal udhaar liya". The app transcribes the speech, works out the customer, items and amounts, asks when something is unclear, and records it.

Built for the Sarvam AI challenge using Sarvam's speech-to-text, text-to-speech and language models.

## What it does

- **Speak to record:** sales (paid or on tab) and payments received, by voice.
- **Asks when unsure:** whether a sale was cash or on tab, which customer was meant, whether to add a new customer. Questions are spoken aloud and can be answered by voice or by button.
- **Tabs:** see who owes how much, customer history, mark paid, undo any entry.
- **Ask by voice:** "kiska kitna baaki hai" is answered from the ledger and spoken back.
- **Reminders:** a ready-made WhatsApp message for each customer with a balance.
- **Stock:** a simple list of items with prices and stock counts.
- **Hindi and English:** the shopkeeper picks a language on first use.

No login: it is a single-shop app.

## Stack

SvelteKit, Svelte 5, TypeScript, Tailwind, shadcn-svelte, Drizzle with libSQL (SQLite or Turso), Bun, Sarvam AI APIs.
