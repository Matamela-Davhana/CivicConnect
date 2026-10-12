const visibleEntries = (entries, role) => {
  if (role === 'staff') return entries.slice();
  if (role === 'requester') return entries.filter((entry) => entry.entryType === 'public');
  return [];
};

module.exports = { visibleEntries };
