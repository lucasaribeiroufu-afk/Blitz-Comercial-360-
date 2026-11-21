import type { Provenance } from '../types';

/** Notes and search objectives cannot establish published purchasing intent. */
export function hasPurchaseIntent(contact?: Provenance | string): boolean {
  if (!contact || typeof contact === 'string' || contact.recordType !== 'purchase_mention') return false;
  const evidence = contact.evidence?.intent;
  return Boolean(contact.intent && contact.matchedProduct && contact.publishedAt
    && Number.isFinite(Date.parse(contact.publishedAt))
    && evidence && evidence.value === contact.intent && evidence.excerpt
    && /^https:\/\//.test(evidence.sourceUrl)
    && Number.isFinite(Date.parse(evidence.retrievedAt)));
}
