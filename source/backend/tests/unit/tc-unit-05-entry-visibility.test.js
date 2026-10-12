const { domain } = require('../helpers/contract');

const { visibleEntries } = domain.visibility();

const entries = [
  { id: 1, entryType: 'public', content: 'Technician booked for Friday' },
  { id: 2, entryType: 'internal', content: 'Requester has complained before; escalate quietly' },
  { id: 3, entryType: 'public', content: 'Repair completed' },
  { id: 4, entryType: 'internal', content: 'Part cost charged to facilities budget' }
];

describe('TC-UNIT-05 FR-012 / RD-08 / NFR-002: entry visibility is decided by role and entry type', () => {
  it('returns only public updates to a requester', () => {
    const result = visibleEntries(entries, 'requester');
    expect(result.map((e) => e.id)).toEqual([1, 3]);
    expect(result.every((e) => e.entryType === 'public')).toBe(true);
  });

  it('returns public updates and internal comments to staff in original order', () => {
    expect(visibleEntries(entries, 'staff').map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it('returns no entry content to management by default', () => {
    expect(visibleEntries(entries, 'management')).toEqual([]);
  });

  it.each(['', undefined, null, 'visitor'])('returns nothing for unknown role %p', (role) => {
    expect(visibleEntries(entries, role)).toEqual([]);
  });

  it('does not mutate the input collection', () => {
    const snapshot = JSON.stringify(entries);
    visibleEntries(entries, 'requester');
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});
