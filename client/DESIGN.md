# Redwood Scholars — UI design rules

Calm, editorial and trustworthy — closer to Linear / Stripe / Notion than a
bright "edtech" app. Children's screens stay friendly through clear layout,
big tap targets and plain encouraging language, not decoration.

## Hard rules
- **No emojis. Ever.** Not in UI copy, buttons, headings, badges, toasts, print output or content. Use icons from `lucide-react`, or plain text.
- **Unicode symbols used as icons also go** (✓ ✗ ✕ ← → ↗ ↻ ▶ ● ○ etc.) — use lucide (`Check`, `X`, `ArrowLeft`, `ExternalLink`, `RefreshCw`, `ChevronRight`, `Circle` …). Exception: print-only answer bubbles in `components/print` may keep ○ for paper.
- **No gradients, no purple / pink / indigo / blue / violet.** Use only the palette below.

## Palette (tailwind.config.js)
| Role | Classes |
|---|---|
| Accent (primary actions, active states, links) | `redwood-600` (bg), `redwood-700` (text/hover), `redwood-50` (tint) |
| Supporting (progress, success, completed, scores ≥70%) | `forest-600/700`, tint `forest-50` |
| Neutrals (text, borders, surfaces) | `gray-*` — remapped to warm stone. Body text `gray-900/700`, secondary `gray-500/600`, borders `gray-200/300` |
| Surfaces | page `bg-canvas`, cards `bg-white`, soft panels `bg-cream` / `.card-muted` |
| Warning / needs attention / mid scores (40–69%) | `amber-50` bg + `amber-800` text (muted) |
| Error / destructive / very low scores (<40%) | `red-50` bg + `red-700` text |

Custom tasks (IXL / paper) that used purple → use neutral `.badge` (gray) with an icon, not a new colour.

## Scores & statuses (use everywhere, consistently)
- Score colours: **≥70% forest**, **40–69% amber**, **<40% red** (text-forest-700 / text-amber-700 / text-red-700; bars forest-500 / amber-400 / red-400). Round before comparing.
- "Awaiting review" = amber badge. Item status: Available/Not started = neutral `.badge`, In progress = `.badge-warning`, Completed = `.badge-success`. Never use redwood/red for neutral states (redwood is for actions, not status).
- Student subject tags (Maths / English / Both) = neutral `.badge`.
- Levels are always written "Level 1" … "Level 5" (short: "L1" only in dense lists). Custom items are "Custom task" / "IXL Maths" / "IXL English" / "Paper activity".
- Titles and buttons in sentence case ("Add new tutor", "Save changes").
- Dialogs: use the app's styled modal (ConfirmModal / .modal-panel), never window.confirm/alert for primary flows; every modal closes with Escape.

## Components (src/index.css)
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, add `.btn-sm` for compact. Icons inside buttons: `<Printer className="icon" aria-hidden />` then text.
- Surfaces: `.card`, `.card-muted`, `.modal-panel` (for dialogs; overlay `bg-gray-900/40`).
- Forms: `.input`, `.label`.
- Type: `.page-title` (serif), `.section-title` (serif), `.eyebrow` (small caps label), `.link`.
- Badges: `.badge` (neutral), `.badge-accent`, `.badge-success`, `.badge-warning`, `.badge-danger`.
- Tabs: `.tabs` wrapper, `.tab` + `.tab-active`.
- Icons: lucide-react, sizes `.icon` (16px), `.icon-sm`, `.icon-lg`; default stroke is fine. Always `aria-hidden` when next to text; give icon-only buttons an `aria-label` and `title`.

## Layout & tone
- Generous spacing (`gap-4/6`, `p-6` cards), clear hierarchy: one page title, section titles, then content.
- Rounded-xl cards with a hairline border and the subtle `shadow-card`; avoid heavy shadows.
- Tables: `text-sm`, header `eyebrow` style on `bg-gray-50`, rows divided by `divide-gray-100`.
- Empty states: a lucide icon in a soft circle (`bg-gray-100 text-gray-400`), a short title, one helpful line, one action.
- Copy: short, plain, British English. Children's copy is warm but simple ("Well done", "Have another go").
