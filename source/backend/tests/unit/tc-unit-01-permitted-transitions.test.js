const { STATUSES, PERMITTED, domain } = require('../helpers/contract');

const { canTransition } = domain.transitions();

const permittedPairs = STATUSES.flatMap((from) => PERMITTED[from].map((to) => [from, to]));

describe('TC-UNIT-01 FR-011 / AC-FR-011: every approved status transition is permitted', () => {
  it('covers all eleven transitions defined in the controlled status model', () => {
    expect(permittedPairs).toHaveLength(11);
  });

  test.each(permittedPairs)('%s -> %s is permitted', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});
