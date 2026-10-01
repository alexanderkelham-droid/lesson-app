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
