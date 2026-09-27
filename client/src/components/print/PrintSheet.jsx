import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'
import LoadingSpinner from '../shared/LoadingSpinner'
import { PrintedSheet, AnswerKey } from './PrintedSheet'
import { PrintToolbar, ToggleChip, OriginalPdfButton, PrintMessage } from './PrintToolbar'
import './print.css'

// /print/sheet/:sheetId[?answers=1] — one worksheet, optional answer key
export default function PrintSheet() {
  const { sheetId } = useParams()
  const [params, setParams] = useSearchParams()
  const answers = params.get('answers') === '1'
  const [sheet, setSheet] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/sheets/${sheetId}`)
      .then(res => {
        setSheet(res.data)
        document.title = `${res.data.title} · Redwood Scholars`
      })
      .catch(err => setError(err.response?.data?.error || 'Could not load this sheet'))
  }, [sheetId])

  function setFlag(key, on) {
    const next = new URLSearchParams(params)
    if (on) next.set(key, '1'); else next.delete(key)
    setParams(next, { replace: true })
  }

  if (error) return <PrintMessage><p className="text-red-700">{error}</p></PrintMessage>
  if (!sheet) return <LoadingSpinner />

  return (
    <div className="print-root">
      <PrintToolbar title={sheet.title}>
        <OriginalPdfButton sheet={sheet} />
        <ToggleChip label="Answer key" checked={answers} onChange={on => setFlag('answers', on)} />
      </PrintToolbar>
      <div>
        <PrintedSheet sheet={sheet} />
        {answers && <AnswerKey sheets={[sheet]} />}
      </div>
    </div>
  )
}
