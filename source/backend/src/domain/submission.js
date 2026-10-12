const isBlank = (value) => typeof value !== 'string' || value.trim().length === 0;

const validateSubmission = (input, activeCategories) => {
  const errors = [];

  if (isBlank(input.category)) {
    errors.push({ field: 'category', message: 'Category is required' });
  } else if (!activeCategories.includes(input.category)) {
    errors.push({ field: 'category', message: 'Choose a category from the list' });
  }

  if (isBlank(input.description)) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  if (input.category === 'Other' && isBlank(input.otherExplanation)) {
    errors.push({ field: 'otherExplanation', message: 'Explain what the request is about' });
  }

  return { valid: errors.length === 0, errors };
};

module.exports = { validateSubmission };
