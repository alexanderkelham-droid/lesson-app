// Custom (non-library) task types for lesson plan items (item.customType).
// 'homework' is printed in the Homework row of the lesson sheet.
export const CUSTOM_TYPES = [
  { value: 'ixl_maths',     label: 'IXL Maths' },
  { value: 'ixl_english',   label: 'IXL English' },
  { value: 'corbett_maths', label: 'Corbett Maths' },
  { value: 'eleven_plus',   label: '11+' },
  { value: 'paper',         label: 'Paper activity' },
  { value: 'homework',      label: 'Homework' },
  { value: 'other',         label: 'Custom task' },
]

export const CUSTOM_LABELS = Object.fromEntries(CUSTOM_TYPES.map(t => [t.value, t.label]))

export function customTypeLabel(type) {
  return CUSTOM_LABELS[type] || 'Custom task'
}

// An item's latest result: the sheet's StudentResponse, or for a custom task
// marked done with a score, { score } (custom tasks have no response record).
export function itemResult(item) {
  const r = item?.studentResponses?.[0]
  if (r) return r
  return item && !item.sheet && !item.sheetId && item.score != null ? { score: item.score } : undefined
}
