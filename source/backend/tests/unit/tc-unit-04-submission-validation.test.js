const { domain } = require('../helpers/contract');

const { validateSubmission } = domain.submission();

const ACTIVE = [
  'Facility Fault',
  'Damaged Equipment',
  'Security Concern',
  'IT Support',
  'Maintenance',
  'Lost Property',
  'Other'
];

const base = { category: 'IT Support', description: 'Projector in room 4 does not power on' };

const fieldsOf = (result) => result.errors.map((e) => e.field);

describe('TC-UNIT-04 FR-002 / FR-003 / RD-03 / RD-04 (EP): submission validation partitions', () => {
  test.each([
    ['valid category and description', base],
    ['every other controlled category is accepted', { ...base, category: 'Lost Property' }],
    ['Other with a non-empty explanation', { category: 'Other', description: 'Odd smell in hall', otherExplanation: 'Does not fit any listed category' }],
    ['explanation supplied for a non-Other category is tolerated', { ...base, otherExplanation: 'extra detail' }]
  ])('valid partition: %s', (_label, input) => {
    const result = validateSubmission(input, ACTIVE);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test.each([
    ['missing category', { description: base.description }, 'category'],
    ['empty category', { ...base, category: '' }, 'category'],
    ['free-text category outside the controlled list', { ...base, category: 'Plumbing' }, 'category'],
    ['category deactivated by an administrator', base, 'category', ACTIVE.filter((c) => c !== 'IT Support')],
    ['missing description', { category: base.category }, 'description'],
    ['empty description', { ...base, description: '' }, 'description'],
    ['whitespace-only description', { ...base, description: '   \n\t ' }, 'description'],
    ['Other without an explanation', { category: 'Other', description: 'Odd smell in hall' }, 'otherExplanation'],
    ['Other with an empty explanation', { category: 'Other', description: 'Odd smell in hall', otherExplanation: '' }, 'otherExplanation'],
    ['Other with a whitespace-only explanation', { category: 'Other', description: 'Odd smell in hall', otherExplanation: '   ' }, 'otherExplanation']
  ])('invalid partition: %s', (_label, input, field, categories = ACTIVE) => {
    const result = validateSubmission(input, categories);
    expect(result.valid).toBe(false);
    expect(fieldsOf(result)).toContain(field);
    const message = result.errors.find((e) => e.field === field).message;
    expect(typeof message).toBe('string');
    expect(message.trim().length).toBeGreaterThan(0);
  });
});
