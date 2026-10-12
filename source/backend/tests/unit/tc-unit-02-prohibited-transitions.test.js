const { STATUSES, PERMITTED, domain } = require('../helpers/contract');

const { canTransition } = domain.transitions();

const prohibitedPairs = STATUSES.flatMap((from) =>
  STATUSES.filter((to) => !PERMITTED[from].includes(to)).map((to) => [from, to])
);

describe('TC-UNIT-02 FR-011 / AC-FR-011 (negative): every unapproved status transition is rejected', () => {
  it('covers every remaining ordered pair of the eight statuses, including self-transitions', () => {
    expect(prohibitedPairs).toHaveLength(8 * 8 - 11);
  });

  test.each(prohibitedPairs)('%s -> %s is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  test.each([
    ['archived', 'closed'],
    ['submitted', 'archived'],
    ['', 'accepted'],
    [undefined, 'accepted'],
    ['submitted', null]
  ])('unknown or missing status %p -> %p is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
