# Voice Khata — plan (Sarvam AI challenge)

Voice-first tab (udhaar) + sales ledger for Indian shopkeepers. Speak, it records. Demo languages: **Hindi + English**.

## 1. Core flow

```
mic (MediaRecorder, webm/opus ≤30s)
  → POST /api/voice            (SvelteKit server route; API key stays server-side)
  → Sarvam STT  saaras:v4      (language_code from onboarding, mode=codemix for Hinglish)
  → Sarvam Chat sarvam-105b    (tool calling → structured intent)
  → server resolves entities   (fuzzy customer/product match)
  → returns a DRAFT            (nothing written yet)
  → UI confirmation card       (+ spoken prompt via TTS when something is unclear)
  → POST /api/commit           (writes ledger)
```

Intents (LLM tools): `record_sale`, `record_payment`, `query_dues`, `add_customer`, `ask_clarification`.

Examples
- "Ramesh ne 2 kilo chawal aur 1 tel udhaar liya" → sale, tab, customer Ramesh, 2 items
- "Sunita ne 200 rupaye diye" → payment 200 from Sunita
- "Ek packet biscuit, paid" → sale, cash, no customer
- "Ramesh ka kitna baaki hai?" / "kiska kitna baaki hai?" → query, answered by DB (TTS reply)

Rules
- Payment mode (cash vs tab) not stated → draft flagged `payment_mode: unknown` → ask "Cash ya udhaar?".
- Customer not matched → "Raju naam ka customer nahi mila. Naya add karun?" (Yes/No by voice or button). Near matches offered first ("Ramesh ya Rakesh?").
- Unknown product → create on the fly with price 0 / ask price; never block.
- LLM never touches the DB. It only emits an intent; deterministic code resolves and writes. Totals are computed in code, not by the model.

## 2. Data model (drizzle / sqlite, replaces the `task` stub in `src/lib/server/db/schema.ts`)

| table | columns |
|---|---|
| `shop` (single row for now) | id, name, language (`hi-IN`/`en-IN`), created_at |
| `customer` | id, name, phone?, created_at |
| `customer_alias` | id, customer_id, alias, alias_norm (Latin, lowercased) — Devanagari + romanized spellings |
| `product` | id, name, unit?, default_price?, stock_qty? |
| `product_alias` | id, product_id, alias, alias_norm |
| `txn` | id, kind (`sale`/`payment`), customer_id?, payment_mode (`cash`/`tab`), amount, note, raw_transcript, created_at |
| `txn_item` | id, txn_id, product_id, qty, unit_price, line_total |

Balance per customer is **derived**: `sum(tab sales) − sum(payments)`. Append-only ledger; "undo" = reversing entry, so a mistake never corrupts history.

## 3. Name matching (the hard part)

STT may return "रमेश" or "Ramesh" for the same person.
1. On customer create, store canonical name + a Latin alias via `/transliterate` (Hindi → Latin) and the Devanagari form.
2. Normalise both sides to Latin-lowercase (transliterate when the transcript is Devanagari; strip vowels/`h` doubling).
3. Score with Levenshtein / trigram similarity over aliases. ≥0.85 → auto-match, 0.6–0.85 → ask, <0.6 → offer to add new.
4. Passing the customer list into STT `keyterms` (up to 50 terms, saaras:v4 only) boosts recognition of known names. Also include the list in the LLM prompt so it can snap to existing names.
5. Confirmed corrections are saved as new aliases (the system learns spellings).

## 4. UI (SvelteKit + shadcn-svelte, mobile-first, big touch targets)

- `/onboarding` — pick language (हिन्दी / English), shop name. Stored in `shop`; UI strings in a tiny `i18n` dict (hi/en).
- `/` — giant mic button (hold or tap to record), live draft card, recent entries.
- `/tabs` — customers sorted by amount due; tap → ledger; "Remind" button; "Mark paid".
- `/customers/[id]` — history, balance, add payment manually.
- `/inventory` (stretch) — products, stock, low stock.
- Reminder: `https://wa.me/<phone>?text=<msg>` deep link (no WhatsApp API needed). Message generated in the customer's language, optionally via `/translate`.
- Mic needs HTTPS or localhost.

## 5. Sarvam usage (and why)

| Need | API | Notes |
|---|---|---|
| Speech → text | `POST /speech-to-text` model `saaras:v4`, `mode=codemix`/`transcribe` | <30 s clips; browser webm/opus is accepted |
| Understand intent | `POST /v1/chat/completions` model `sarvam-105b` (or `-conversations`, 32K, lower latency) | OpenAI-compatible tools; v2 endpoint needs a whitelisted key, so use v1 |
| Speak replies / prompts | `POST /text-to-speech` `bulbul:v3` (or `bulbul:v4-flash`), `hi-IN`/`en-IN`, 22050 Hz mp3/wav | Returns base64; limit 2500 chars. v3 sunset notice applies to Voice Agents only, but consider v4-flash |
| Name aliases | `POST /transliterate` | Hindi ↔ Latin |
| Reminder text | `POST /translate` (`mayura:v1`) | optional |
| **Vision** | Doc AI `sarvam-vision`: `/doc-ai/v1/job/extract` with a JSON schema | Photo of the old paper notebook → bulk import of customers and dues. Stretch/demo wow. Async job (poll status), ≤10 pages |

Auth: header `api-subscription-key`. Put `SARVAM_API_KEY` in `.env` and `.env.example`, read in `src/env.ts` / `$env/dynamic/private`. Free ₹100 credit covers the demo (STT ₹30/hr, TTS ₹30 per 10K chars, chat ₹15/₹60 per 1M tokens).

Server module layout
```
src/lib/server/sarvam/{client,stt,tts,chat,transliterate,docai}.ts
src/lib/server/voice/{intent-tools,resolve,match}.ts
src/routes/api/voice/+server.ts      # audio -> draft
src/routes/api/commit/+server.ts     # draft -> ledger
src/routes/api/tts/+server.ts
```

## 6. Sarvam API index

Base `https://api.sarvam.ai`. Auth `api-subscription-key: <KEY>` (Bearer also accepted). Auth errors return 403. Error shape `{error:{message,code,request_id}}`. Specs: `docs.sarvam.ai/openapi.json`, `/asyncapi.json`. Docs index: `docs.sarvam.ai/llms.txt`.

### Speech-to-text (Saaras: `saaras:v4` default, `saaras:v3`, `saaras:v3-realtime` WS only, `saaras:v2.5` legacy)
Modes: `transcribe`, `translate` (→English), `verbatim`, `translit` (Roman), `codemix`.
- `POST /speech-to-text` — REST, multipart, <30 s. Fields: `file`, `model`, `mode`, `language_code` (23 codes or `unknown`), `with_timestamps`, `input_audio_codec` (PCM only), `keyterms` (≤50, v4 only). No diarization.
- `POST /speech-to-text-translate` — legacy.
- Batch (async, diarization): `POST /speech-to-text/job/v1` → `POST .../upload-files` → `POST .../{job_id}/start` → `GET .../{job_id}/status` → `POST .../download-files`.
- `wss://api.sarvam.ai/speech-to-text-realtime/ws` — streaming; query `language_code` (`auto` ok), `model`, `stream_type`, `mode`, `endpointing`, `encoding`, `sample_rate` (16000/8000). Events `audio_input`, `flush`, `end`; server `transcript.partial/final`.

### Text-to-speech (Bulbul: `bulbul:v3`, `bulbul:v4-flash`, `bulbul:v2` legacy)
- `POST /text-to-speech` — JSON; `text`, `language_code` (11 langs), `speaker` (v3 default `shubh`), `model`, `pace`, `temperature`, `speech_sample_rate`, `output_audio_codec`, `dict_id`. Returns `{audios:[base64]}`.
- `POST /text-to-speech/stream` — binary audio stream, text ≤3500.
- `wss://api.sarvam.ai/text-to-speech/ws` — `config`, `text`, `flush`, `ping`.
- Pronunciation dictionary: `POST /text-to-speech/pronunciation-dictionary` (+ list/get/update/delete). Useful for product names.

### Voice cloning (beta)
- `POST /voices/create`, `POST /voices/clone` (+ clone-stream, clone-ws, list/get/delete voices).

### Text
- `POST /translate` — `mayura:v1` (11 langs, modes, `auto` source) or `sarvam-translate:v1` (23 langs).
- `POST /transliterate`
- `POST /text-lid` — language + script identification.
- Document Translation: `POST /translate/document/jobs` → PUT upload → `/start` → `/live-status` → `/export` → `/export/status`.

### Chat / LLM
- `POST /v1/chat/completions` — `sarvam-105b` (128K), `sarvam-105b-conversations` (32K). Tools, `response_format` json_object/json_schema, streaming, `reasoning_effort`.
- `POST /v2/chat/completions` (beta, whitelisted key) — adds `glm5.3`, `gemma4` (image input), `deepseekv4.1-flash`. `GET /v2/models`.
- `POST /v2/responses` — OpenAI Responses format, stateless.
- Deprecated: Sarvam-M, Sarvam-30B.

### Vision / Document intelligence (`sarvam-vision`)
- `POST /doc-ai/v1/job/upload` (presigned) · `POST /doc-ai/v1/job/digitise` (→ HTML/MD/JSON) · `POST /doc-ai/v1/job/extract` (schema-driven JSON) · `GET /doc-ai/v1/job/{id}/status` · results / download-url endpoints. PDF/PNG/JPG/ZIP, ≤10 pages, ≤200 MB.
- Legacy `document_intelligence` API still exists.

### Dubbing (beta)
- `POST /dubbing/jobs` → PUT media → `/start` → live-status / export-status.

### Rate limits (Starter): STT 60/min, TTS 60/min (v3: 30), chat 60/min (105b: 40), translate 60/min. 429 → exponential backoff.

### Gotchas found in the docs
- Odia is `od-IN` on most routes but `or-IN` on realtime STT, document translation, dubbing.
- Doc AI rate limit differs between pages (10 vs 30–200 req/min).
- WS TTS default model is `bulbul:v2`, REST is `bulbul:v3`.
- Paths not verified in the docs read: pronunciation-dictionary list/get/update/delete, voice-cloning list/get/delete, Doc AI results/download-url, dubbing status. Check the OpenAPI spec before using them.

## 7. Build order

1. **Foundation**: `.env` key, Sarvam client, schema + `db:push`, i18n skeleton, onboarding page.
2. **Voice → draft**: record in browser, STT, LLM tools, resolve + fuzzy match, draft card UI. Verify with Hindi and English clips.
3. **Commit + tabs**: ledger writes, `/tabs` list with balances, mark paid, undo.
4. **Clarification loop**: ask for cash/tab, add-new-customer, ambiguous names; TTS prompts.
5. **Voice queries**: "kiska kitna baaki hai" answered from the DB and spoken.
6. **Reminders**: WhatsApp deep link with localized text.
7. **Stretch**: Sarvam Vision notebook import; inventory/stock; pronunciation dictionary; realtime STT WebSocket.

## 8. Risks

- Hinglish and noisy shop audio: use `codemix`, `keyterms`, always show a confirmation card before writing.
- Latency of STT + LLM + TTS: use `sarvam-105b-conversations`, `reasoning_effort` low, short prompts, show the transcript immediately.
- LLM hallucinated amounts: totals computed in code, user confirms.
- Illiterate users: every prompt is also spoken; use icons and big buttons, minimal text.
- Currency/number words in Hindi ("dedh sau", "dhai kilo"): add a normalisation rule in the system prompt with examples.
- Prices unknown for new items: allow amount spoken as total ("kul 150 rupaye").

## 9. Decisions needed

- Local sqlite (`DATABASE_URL`) is fine for demo; deploy target decides whether to switch to Turso (already `@libsql/client`).
- Track stock now or later? (Plan assumes later.)

## 10. Verified live (2026-10-17)

Tested with Sarvam-synthesised English and Hindi audio piped through `/api/voice` (no real microphone).
- `POST /text-to-speech` (`bulbul:v3`, field `language_code`), `POST /speech-to-text` (`saaras:v4`, `transcribe`/`codemix`), `POST /v1/chat/completions` (`sarvam-105b-conversations`, tools) all work as coded. No API mismatches found.
- Verified: sale/payment/query intents in en and hi, Devanagari customer matching, "डेढ़ सौ" -> 150, `?mode=answer`, dues answer, `/api/tts`.
- Not verified live: `keyterms`, transliterate aliasing, Vision import, browser MediaRecorder capture on a phone.
- The model assumes "cash" whenever a price is said, so payment mode is now accepted only when the transcript has an explicit word (`verifyPaymentMode`); otherwise the app asks.
