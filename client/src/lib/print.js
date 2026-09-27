import api from './api'

// URLs for the printable views (staff only). Open them in a new tab.
export function printSheetUrl(sheetId, { answers = false } = {}) {
  return `/print/sheet/${sheetId}${answers ? '?answers=1' : ''}`
}

// session: a session id, 'next', 'all' or 'unscheduled'
export function printPlanUrl(planId, { session = 'all', answers = false, notes = false } = {}) {
  const q = new URLSearchParams({ session: String(session) })
  if (answers) q.set('answers', '1')
  if (notes) q.set('notes', '1')
  return `/print/plan/${planId}?${q}`
}

export function openInNewTab(url) {
  window.open(url, '_blank', 'noopener')
}

// Open a sheet's original PDF in a new tab. The API needs the JWT header, so
// a plain link won't work: fetch it as a blob and open an object URL. The tab
// is opened synchronously (inside the click) so popup blockers allow it.
// Hosted originals come back as a short-lived signed link; otherwise (local
// dev archive) the PDF is streamed through the API.
// `sheet` may be a sheet object or an id.
export async function openOriginalPdf(sheet) {
  const sheetId = typeof sheet === 'object' ? sheet.id : sheet
  const win = window.open('', '_blank')
  if (win) win.document.write('<p style="font-family:sans-serif;padding:2rem;color:#555">Loading original PDF…</p>')
  try {
    const link = await api.get(`/sheets/${sheetId}/original`, { params: { link: 1 } })
    if (link.data?.url) {
      if (win) win.location.href = link.data.url
      else window.location.href = link.data.url
      return
    }
    const res = await api.get(`/sheets/${sheetId}/original`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    if (win) win.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    if (win) win.close()
    let message = 'Could not open the original PDF'
    // Error bodies arrive as a Blob because of responseType: 'blob'
    try {
      const data = err.response?.data
      const body = data instanceof Blob ? JSON.parse(await data.text()) : data
      if (body?.error) message = body.error
    } catch { /* keep default */ }
    alert(message)
  }
}

// Download a merged PDF of ORIGINAL scanned worksheets (for printing a pile
// of physical copies). `apiPath` is e.g. /lesson-plans/17/originals?session=5
// or /sessions/originals?date=2026-10-02. The API returns a short-lived link
// (hosted) or the PDF itself (local dev). Returns the pack summary.
// If no sheet had an original (summary.included === 0) the tab is closed
// again and the summary comes back with `empty: true` so the caller can say so.
// With { quiet: true } errors come back as { error } instead of an alert.
export async function downloadOriginalsPack(apiPath, { quiet = false } = {}) {
  const win = window.open('', '_blank')
  if (win) win.document.write('<p style="font-family:sans-serif;padding:2rem;color:#555">Building the print pack from the original worksheets… this can take a few seconds.</p>')
  try {
    const res = await api.get(apiPath, { responseType: 'blob' })
    const type = res.headers['content-type'] || ''
    let url, summary = null
    if (type.includes('application/json')) {
      const data = JSON.parse(await res.data.text())
      url = data.url
      summary = data
    } else {
      url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
      try { summary = JSON.parse(res.headers['x-pack-summary'] || 'null') } catch { /* optional */ }
    }
    if (summary && summary.included === 0) {
      if (win) win.close()
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      return { ...summary, empty: true }
    }
    if (win) win.location.href = url
    else window.location.href = url
    return summary
  } catch (err) {
    if (win) win.close()
    let message = 'Could not build the print pack'
    try {
      const data = err.response?.data
      const body = data instanceof Blob ? JSON.parse(await data.text()) : data
      if (body?.error) message = body.error
    } catch { /* keep default */ }
    if (quiet) return { error: message }
    alert(message)
    return null
  }
}

// URL the preview can embed for a sheet's original (signed link or blob)
export async function originalPdfEmbedUrl(sheetId) {
  const link = await api.get(`/sheets/${sheetId}/original`, { params: { link: 1 } })
  if (link.data?.url) return { url: link.data.url, revoke: null }
  const res = await api.get(`/sheets/${sheetId}/original`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  return { url, revoke: () => URL.revokeObjectURL(url) }
}
