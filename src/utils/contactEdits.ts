import type { Contact } from '../types';

export function withEditedEvidence(contact: Contact, updates: Partial<Contact>): Partial<Contact> {
  const evidence = {...contact.evidence};
  for (const [field, value] of Object.entries(updates)) {
    if (evidence[field] && JSON.stringify(evidence[field].value) !== JSON.stringify(value)) delete evidence[field];
  }
  return {...updates, evidence};
}
