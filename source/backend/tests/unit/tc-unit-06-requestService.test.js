const { validateSubmission } = require('../src/domain/Submission');
const { canTransition } = require('../src/domain/statusTransitions');

describe('Unit/Component Tests', () => {

  // 1. Business Rule: Category required
  test('should throw error if category is missing', () => {
    expect(() => submitRequest({ category: '', description: 'Broken chair' }))
      .toThrow('Category is required');
  });

  // 2. Business Rule: Description required
  test('should throw error if description is missing', () => {
    expect(() => submitRequest({ category: 'Facility Fault', description: '' }))
      .toThrow('Description is required');
  });

  // 3. Business Rule: "Other" category requires explanation
  test('should throw error if "Other" category has too short description', () => {
    expect(() => submitRequest({ category: 'Other', description: 'x' }))
      .toThrow('Other category requires explanation');
  });

  // 4. Status Model: Valid transition Submitted → Accepted
  test('should allow Submitted → Accepted transition', () => {
    const result = transitionStatus('Submitted', 'Accepted');
    expect(result).toBe('Accepted');
  });

  // 5. Status Model: Invalid transition Submitted → Closed
  test('should reject invalid transition Submitted → Closed', () => {
    expect(() => transitionStatus('Submitted', 'Closed'))
      .toThrow('Invalid transition');
  });

});
