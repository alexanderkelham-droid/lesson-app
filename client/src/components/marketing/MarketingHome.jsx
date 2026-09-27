import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Brain,
  Calculator,
  Check,
  ChartLine,
  ClipboardCheck,
  GraduationCap,
  Languages,
  Mail,
  MapPin,
  Menu,
  MonitorPlay,
  Phone,
  Route,
  ShieldCheck,
  Sun,
  UsersRound,
  X,
} from 'lucide-react'
import RedwoodLogo from '../shared/RedwoodLogo'

const PHONE_DISPLAY = '0333 050 7765'
const PHONE_HREF = 'tel:03330507765'
const EMAIL = 'hello@redwoodscholars.co.uk'

const navLinks = [
  { href: '#subjects', label: 'Subjects' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#portal', label: 'Online portal' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#contact', label: 'Contact' },
]

const subjects = [
  { icon: Calculator, title: 'Maths', desc: 'From basic numeracy to GCSE level — structured progression with regular assessment.' },
  { icon: BookOpen, title: 'English', desc: 'Comprehension, grammar, spelling and creative writing across all key stages.' },
  { icon: GraduationCap, title: '11+ Preparation', desc: 'Targeted coaching for grammar school and independent school entrance exams.' },
  { icon: Languages, title: 'Spanish', desc: 'Foundational language skills with conversational and exam-focused options.' },
  { icon: Brain, title: 'Dyslexia Screening', desc: 'Professional screening assessments and personalised support plans.' },
  { icon: Sun, title: 'Summer Workshops', desc: 'Intensive holiday programmes to consolidate learning and prepare for the year ahead.' },
]

const features = [
  { icon: UsersRound, title: 'Small class sizes', desc: 'Maximum 5 students per group — every child gets focused attention.' },
  { icon: ShieldCheck, title: 'DBS-checked tutors', desc: 'All staff are fully DBS-cleared and First Aid trained for your peace of mind.' },
  { icon: ClipboardCheck, title: 'Free initial assessment', desc: 'We start with a no-obligation assessment to identify exactly where your child is.' },
  { icon: MapPin, title: 'Two convenient locations', desc: 'Centres in Retford and Doncaster, easily accessible across the region.' },
]

const steps = [
  {
    icon: ClipboardCheck,
    title: 'Free assessment',
    desc: "Book a no-obligation assessment at one of our centres. We'll evaluate your child's current level.",
  },
  {
    icon: Route,
    title: 'A tailored programme',
    desc: 'We recommend a learning programme built around your child, with a personalised lesson plan.',
  },
  {
    icon: ChartLine,
    title: 'Lessons and progress',
    desc: 'Small-group lessons in centre or live online, with progress you can follow at a glance.',
  },
]

const portalPoints = [
  'Personalised lesson plans for every student',
  'Auto-marked practice sheets with instant feedback',
  'Live online lessons, working through sheets together with the tutor',
  'Progress tracking parents can see at a glance',
]

const testimonials = [
  {
    quote: 'My daughter passed her 11+ with one of the highest scores in the county. The structured approach at Redwood made all the difference.',
    author: 'Parent, Retford',
  },
  {
    quote: 'Within a term my son moved up two sets in maths at school. The teaching is patient, thorough and genuinely tailored.',
    author: 'Parent, Doncaster',
  },
  {
    quote: 'The dyslexia screening and follow-up support gave us a clear path forward. We finally understood how to help our son learn.',
    author: 'Parent, Bawtry',
  },
]

const centres = [
  { name: 'Retford Centre', address: '74a Bridgegate, Retford DN22 7UZ' },
  { name: 'Doncaster Centre', address: 'Danum House, 6a South Parade, Doncaster DN1 2DY' },
]

function SectionHeading({ eyebrow, title, intro, align = 'center' }) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : ''
  return (
    <div className={`max-w-2xl ${alignCls} mb-12 sm:mb-14`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-redwood-700">{eyebrow}</p>
      <h2 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mt-3 leading-tight">
        {title}
      </h2>
      {intro && <p className="text-gray-600 mt-4 leading-relaxed">{intro}</p>}
    </div>
  )
}

/* A calm, illustrative preview of a live lesson worksheet (decorative). */
function PortalPreview() {
  return (
    <div className="modal-panel overflow-hidden" aria-hidden="true">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <MonitorPlay className="icon text-redwood-600" />
          Live lesson
        </div>
        <span className="badge-success">
          <span className="w-1.5 h-1.5 rounded-full bg-forest-600" />
          Tutor connected
        </span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="eyebrow">Maths · Fractions</p>
        <p className="font-serif text-lg font-semibold text-gray-900 mt-1">Adding fractions</p>
        <div className="mt-5 space-y-3">
          {[
            { q: '1/4 + 1/4 =', a: '1/2', done: true },
            { q: '1/3 + 1/6 =', a: '1/2', done: true },
            { q: '2/5 + 1/10 =', a: '', done: false },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 text-xs font-medium text-gray-400">{i + 1}.</span>
              <span className="text-sm text-gray-800 w-24">{row.q}</span>
              <span
                className={`flex-1 h-9 rounded-lg border px-3 flex items-center text-sm ${
                  row.done ? 'border-gray-200 bg-white text-gray-900' : 'border-redwood-500 ring-2 ring-redwood-500/20 bg-white'
                }`}
              >
                {row.a}
              </span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${row.done ? 'bg-forest-50 text-forest-700' : 'bg-gray-100 text-gray-300'}`}>
                <Check className="icon-sm" />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex-1 mr-4">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full w-2/3 bg-forest-600 rounded-full" />
            </div>
          </div>
          <span className="text-xs font-medium text-gray-500">2 of 3</span>
        </div>
      </div>
    </div>
  )
}

export default function MarketingHome() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="bg-canvas text-gray-900 font-sans">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center" onClick={() => setMenuOpen(false)}>
            <RedwoodLogo variant="wordmark" size="md" />
          </a>
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-gray-600" aria-label="Main">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost hidden sm:inline-flex">
              Portal login
            </Link>
            <a href={PHONE_HREF} className="btn-primary hidden sm:inline-flex">
              <Phone className="icon" aria-hidden />
              Call us
            </a>
            <button
              type="button"
              className="btn-ghost lg:hidden"
              onClick={() => setMenuOpen(o => !o)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              title={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="icon-lg" aria-hidden /> : <Menu className="icon-lg" aria-hidden />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="lg:hidden border-t border-gray-200 bg-canvas" aria-label="Mobile">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col">
              {navLinks.map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {l.label}
                </a>
              ))}
              <div className="flex gap-2 pt-3 mt-2 border-t border-gray-200 sm:hidden">
                <a href={PHONE_HREF} className="btn-primary flex-1">
                  <Phone className="icon" aria-hidden />
                  Call us
                </a>
                <Link to="/login" className="btn-secondary flex-1">Portal login</Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section id="top" className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-redwood-700">
              <MapPin className="icon-sm" aria-hidden />
              Tuition in Retford &amp; Doncaster
            </p>
            <h1 className="font-serif text-[2.5rem] leading-[1.08] sm:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 mt-5">
              Teaching the way <span className="italic text-redwood-700">you learn</span>.
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mt-6 max-w-xl">
              Quality tuition in English, Maths, 11+ preparation and more — with experienced, DBS-checked teachers who tailor every lesson to the individual child.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mt-8">
              <a href={PHONE_HREF} className="btn-primary px-5 py-3 text-base">
                Book a free assessment
                <ArrowRight className="icon" aria-hidden />
              </a>
              <Link to="/login" className="btn-secondary px-5 py-3 text-base">
                Portal login
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Or call us on{' '}
              <a href={PHONE_HREF} className="link font-medium">{PHONE_DISPLAY}</a>
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
              {['Ages 3–16', 'Groups of 5 or fewer', 'DBS cleared'].map(t => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="icon text-forest-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 sm:-inset-6 bg-cream rounded-3xl" aria-hidden="true" />
            <div className="relative">
              <PortalPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section id="why" className="bg-white border-b border-gray-200" aria-label="Why families choose Redwood">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map(f => (
            <div key={f.title} className="flex gap-4">
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-redwood-50 text-redwood-700 flex items-center justify-center">
                <f.icon className="icon-lg" aria-hidden />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mt-1">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Subjects */}
      <section id="subjects" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Our programmes"
            title="Subjects we teach"
            intro="Structured learning programmes designed to build solid foundations and prepare students for every academic challenge ahead."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {subjects.map(s => (
              <div
                key={s.title}
                className="bg-white rounded-xl border border-gray-200 shadow-card p-6 sm:p-7 transition-colors hover:border-gray-300"
              >
                <div className="w-11 h-11 rounded-lg bg-cream text-redwood-700 flex items-center justify-center">
                  <s.icon className="icon-lg" aria-hidden />
                </div>
                <h3 className="font-serif text-xl font-semibold text-gray-900 mt-5">{s.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-cream border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeading eyebrow="Getting started" title="How it works" />
          <ol className="grid md:grid-cols-3 gap-5 md:gap-6">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-white rounded-xl border border-gray-200 shadow-card p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-4xl font-semibold text-redwood-600 leading-none">{i + 1}</span>
                  <s.icon className="icon-lg text-gray-400" aria-hidden />
                </div>
                <h3 className="font-serif text-xl font-semibold text-gray-900 mt-6">{s.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">{s.desc}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <a href={PHONE_HREF} className="btn-primary px-5 py-3 text-base">
              Book a free assessment
              <ArrowRight className="icon" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* Online portal */}
      <section id="portal" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Online lesson portal"
              title="Learning that continues between lessons"
              intro="Students get their own digital learning portal with personalised lesson plans, interactive worksheets, and live online lessons where they work through sheets together with their tutor."
            />
            <ul className="space-y-3 -mt-4">
              {portalPoints.map(p => (
                <li key={p} className="flex items-start gap-3 text-gray-700">
                  <span className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-forest-50 text-forest-700 flex items-center justify-center">
                    <Check className="icon-sm" aria-hidden />
                  </span>
                  <span className="text-sm sm:text-base leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
            <Link to="/login" className="btn-secondary mt-8">
              Sign in to the portal
              <ArrowRight className="icon" aria-hidden />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: MonitorPlay, title: 'Live online lessons', desc: 'Student and tutor see the same worksheet and work through it together.' },
              { icon: ClipboardCheck, title: 'Interactive worksheets', desc: 'Answers are typed straight in, with instant feedback on practice sheets.' },
              { icon: Route, title: 'Personalised plans', desc: 'Each student follows a lesson plan built around their needs.' },
              { icon: ChartLine, title: 'Clear progress', desc: 'Completed sheets and scores are easy for families to follow.' },
            ].map(c => (
              <div key={c.title} className="card-muted">
                <c.icon className="icon-lg text-redwood-700" aria-hidden />
                <h3 className="text-sm font-semibold text-gray-900 mt-4">{c.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 sm:py-28 bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeading eyebrow="From our families" title="What parents are saying" />
          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {testimonials.map(t => (
              <figure key={t.author} className="rounded-xl border border-gray-200 bg-canvas p-6 sm:p-7 flex flex-col">
                <blockquote className="font-serif text-lg leading-relaxed text-gray-800 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 pt-4 border-t border-gray-200 text-sm font-medium text-gray-500">
                  {t.author}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl bg-redwood-700 text-white px-6 py-12 sm:px-12 sm:py-16 grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-14 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-redwood-100">Get in touch</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight mt-3 leading-tight">
                Ready to get started?
              </h2>
              <p className="text-redwood-50/90 mt-4 leading-relaxed max-w-lg">
                Book a free initial assessment at one of our centres. We'll evaluate your child's current level and recommend a tailored learning programme.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-8">
                <a
                  href={PHONE_HREF}
                  className="btn bg-white text-redwood-700 hover:bg-redwood-50 px-5 py-3 text-base shadow-card"
                >
                  <Phone className="icon" aria-hidden />
                  Call {PHONE_DISPLAY}
                </a>
                <a
                  href={`mailto:${EMAIL}`}
                  className="btn border border-white/40 text-white hover:bg-white/10 px-5 py-3 text-base"
                >
                  <Mail className="icon" aria-hidden />
                  Email us
                </a>
              </div>
            </div>
            <div className="space-y-4">
              {centres.map(c => (
                <div key={c.name} className="bg-white text-gray-900 rounded-xl p-5 sm:p-6 flex gap-4">
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-redwood-50 text-redwood-700 flex items-center justify-center">
                    <MapPin className="icon-lg" aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-semibold">{c.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{c.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-cream">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm">
          <RedwoodLogo variant="wordmark" size="sm" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-gray-600">
            <a href={PHONE_HREF} className="inline-flex items-center gap-1.5 hover:text-gray-900">
              <Phone className="icon" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
              <Mail className="icon" aria-hidden />
              {EMAIL}
            </a>
            <Link to="/login" className="font-medium hover:text-gray-900">Portal login</Link>
            <span className="text-gray-500">&copy; {new Date().getFullYear()} Redwood Scholars</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
