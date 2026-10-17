/** App-facing ledger API bound to the real db. Pure logic lives in ledger-core.ts. */
import { db } from '#lib/server/db/index.js';
import type { CommitInput } from '#lib/ledger-types.js';
import * as core from '#lib/server/ledger-core.js';
import { sarvamConfigured } from '#lib/server/sarvam/client.js';
import { transliterate } from '#lib/server/sarvam/transliterate.js';

export { LedgerError } from '#lib/server/ledger-core.js';

export const listBalances = () => core.listBalances(db);
export const getCustomerLedger = (customerId: string) => core.getCustomerLedger(db, customerId);
export const commit = (input: CommitInput) => core.commit(db, input);
export const undo = (txnId: string) => core.undo(db, txnId);
export const findDues = (customerId?: string) => core.findDues(db, customerId);
export const addCustomerAlias = (customerId: string, alias: string) =>
	core.addCustomerAlias(db, customerId, alias);
export const createCustomer = (
	input: { name: string; phone?: string | null },
	deps: core.CustomerDeps = { transliterate: sarvamConfigured() ? transliterate : null }
) => core.createCustomer(db, input, deps);
