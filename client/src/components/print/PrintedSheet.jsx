import SheetIntro, { ImageHint } from '../shared/SheetIntro'
// Paper renderings of a sheet (student copy) and its answer key.
// Used by the /print/sheet and /print/plan views.

// Small deterministic PRNG so a matching column is shuffled the same way on
// every print of the same sheet (student copy and answer key stay in sync).
function seededRandom(seedText) {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619)
  return () => {
    h += 0x6D2B79F5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function deterministicShuffle(list, seed) {
  const out = [...list]
  const rand = seededRandom(String(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  // Never hand out the answer in order: rotate if the shuffle left it unchanged
  if (out.length > 1 && out.every((v, i) => v === list[i])) out.push(out.shift())
  return out
}

const asList = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const BLANK = /_{3,}/

function Prompt({ text }) {
  // Turn "____" in a prompt into a proper write-on line
  const parts = String(text || '').split(/_{3,}/)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="blank">&nbsp;</span>}
        </span>
      ))}
    </>
  )
}

function Ruled({ lines }) {
  return <div className="ruled">{Array.from({ length: lines }, (_, i) => <div key={i} />)}</div>
}

function Options({ options, multi }) {
  return (
    <ul className="options">
      {options.map((opt, j) => (
        <li key={j}>
          {multi ? <span className="check-box" aria-hidden /> : <span className="bubble">○</span>}
          <span>{String.fromCharCode(65 + j)}. {opt}</span>
        </li>
      ))}
    </ul>
  )
}

function QuestionBody({ q, seed }) {
  const points = Number(q.points) || 1
  const options = asList(q.options)
  switch (q.type) {
    case 'multiple_choice': {
      const multi = q.multi || asList(q.correct).length > 1
      return (
        <>
          {multi && <p className="muted">Tick all that apply.</p>}
          <Options options={options} multi={multi} />
        </>
      )
    }
    case 'fill_in_blank':
      return BLANK.test(q.prompt || '') ? null : <div className="answer-line">Answer:</div>
    case 'free_text':
      return <Ruled lines={Math.min(14, 3 + points * 2)} />
    case 'matching': {
      const pairs = asList(q.pairs)
      const rights = deterministicShuffle(pairs.map(p => p.right), seed)
      return (
        <>
          <p className="muted">Draw a line to match each one.</p>
          <div className="match">
            {pairs.map((p, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className="left">{p.left}<span className="dot" /></div>
                <div />
                <div className="right"><span className="dot" />{rights[i]}</div>
              </div>
            ))}
          </div>
        </>
      )
    }
    case 'ordering': {
      // Options are normally stored scrambled; if only the answer exists, scramble it
      const items = options.length ? options : deterministicShuffle(asList(q.correct_order), seed)
      return (
        <>
          <p className="muted">Number the boxes in the right order (1 = first).</p>
          <ul className="order-list">
            {items.map((it, j) => <li key={j}><span className="num-box" />{it}</li>)}
          </ul>
        </>
      )
    }
    case 'image_based':
      return (
        <>
          {q.imageUrl && <img src={q.imageUrl} alt="" className="q-image" />}
          {options.length > 0 ? <Options options={options} multi={asList(q.correct).length > 1} /> : <Ruled lines={3} />}
        </>
      )
    default:
      return options.length > 0 ? <Options options={options} /> : <Ruled lines={3} />
  }
}

// One sheet as a printable page. `studentName` pre-fills the name line.
export function PrintedSheet({ sheet, studentName, dateLabel, toolbarExtra }) {
  const content = sheet.contentJson || {}
  const questions = asList(content.questions)
  if (content.printOnly) {
    // No digital version yet: point to the original instead of an empty page
    return (
      <section className="paper">
        <div className="sheet-brand"><span>Redwood Scholars</span><span>{sheet.subject}{sheet.topic ? ` · ${sheet.topic}` : ''}</span></div>
        <h2 className="sheet-title">{sheet.title}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Paper worksheet: print the original PDF for this one (it is included in "Download original sheets").
        </p>
        {toolbarExtra && <div className="no-print" style={{ marginTop: 8 }}>{toolbarExtra}</div>}
      </section>
    )
  }
  return (
    <section className="paper">
      <div className="sheet-brand">
        <span>Redwood Scholars</span>
        <span>{[sheet.subject, sheet.topic].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="name-line">
        <span>Name: {studentName || ''}</span>
        <span style={{ flex: 0.6 }}>Date: {dateLabel || ''}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h1 className="sheet-title">{sheet.title}</h1>
        {toolbarExtra && <div className="no-print">{toolbarExtra}</div>}
      </div>

      <SheetIntro content={content} print />
      {content.passage && <div className="passage">{content.passage}</div>}

      {questions.map((q, i) => (
        <div key={q.id || i} className="question avoid-break">
          <span className="q-num">{i + 1}.</span>
          <div className="q-body">
            <Prompt text={q.prompt} />
            <ImageHint question={q} print />
            {Number(q.points) > 1 && <span className="q-points">({q.points} marks)</span>}
            <QuestionBody q={q} seed={`${sheet.id}:${q.id || i}`} />
          </div>
        </div>
      ))}
      {questions.length === 0 && <p className="muted">This sheet has no questions yet.</p>}
    </section>
  )
}

function answerText(q) {
  switch (q.type) {
    case 'matching':
      return asList(q.pairs).map(p => `${p.left} – ${p.right}`).join(';  ') || '—'
    case 'ordering':
      return asList(q.correct_order).map((v, i) => `${i + 1}. ${v}`).join('  ') || '—'
    case 'multiple_choice': {
      const options = asList(q.options)
      return asList(q.correct).map(c => {
        const idx = options.findIndex(o => String(o) === String(c))
        return idx >= 0 ? `${String.fromCharCode(65 + idx)}. ${c}` : c
      }).join(', ') || '—'
    }
    default: {
      const key = asList(q.correct)
      if (key.length) return key.join(' / ')
      return q.type === 'free_text' || q.type === 'image_based' ? 'Open answer (tutor to mark)' : '—'
    }
  }
}

// Answer keys for several sheets, compact, on one or more pages.
export function AnswerKey({ sheets }) {
  if (!sheets.length) return null
  return (
    <section className="paper key">
      <div className="sheet-brand">
        <span>Redwood Scholars</span>
        <span>Teacher copy</span>
      </div>
      <h2>Answer key</h2>
      {sheets.map((sheet, n) => (
        <div key={`${sheet.id}-${n}`} className="avoid-break">
          <h3>{sheets.length > 1 ? `${n + 1}. ` : ''}{sheet.title}</h3>
          <ol>
            {asList(sheet.contentJson?.questions).map((q, i) => (
              <li key={q.id || i}>{answerText(q)}</li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
