const { validateSubmission } = require('../../src/domain/submission');
const { canTransition } = require('../../src/domain/statusTransitions');

describe('Unit/Component Tests', () => {

  // 1. Business Rule: Category required
  test('should reject if category is missing', () => {
    const result = validateSubmission({ category: '', description: 'Broken chair' }, ['Facility Fault']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Category is required/);
  });

  // 2. Business Rule: Description required
  test('should reject if description is missing', () => {
    const result = validateSubmission({ category: 'Facility Fault', description: '' }, ['Facility Fault']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Description is required/);
  });

  // 3. Business Rule: "Other" category requires explanation
  test('should reject if "Other" category has too short description', () => {
    const result = validateSubmission({ category: 'Other', description: 'x' }, ['Other']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Explain what the request is about/);
  });

  // 4. Status Model: Valid transition Submitted → Accepted
  test('should allow Submitted → Accepted transition', () => {
    const result = canTransition('submitted', 'accepted');
    expect(result).toBe(true);
  });

  // 5. Status Model: Invalid transition Submitted → Closed
  test('should reject Submitted → Closed transition', () => {
    const result = canTransition('submitted', 'closed');
    expect(result).toBe(false);
  });

});

describe('Request Service Tests', () => {
  test('should validate request creation with correct input', () => {
    const result = validateSubmission(
      { category: 'Facility Fault', description: 'Broken desk' },
      ['Facility Fault']
    );
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

