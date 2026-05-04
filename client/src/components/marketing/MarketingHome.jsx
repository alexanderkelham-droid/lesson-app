import { Link } from 'react-router-dom'
import RedwoodLogo from '../shared/RedwoodLogo'

const subjects = [
  { icon: '📐', title: 'Maths', desc: 'From basic numeracy to GCSE level — structured progression with regular assessment.', accent: 'forest' },
  { icon: '📖', title: 'English', desc: 'Comprehension, grammar, spelling and creative writing across all key stages.', accent: 'redwood' },
  { icon: '🎓', title: '11+ Preparation', desc: 'Targeted coaching for grammar school and independent school entrance exams.', accent: 'forest' },
  { icon: '🇪🇸', title: 'Spanish', desc: 'Foundational language skills with conversational and exam-focused options.', accent: 'redwood' },
  { icon: '🧩', title: 'Dyslexia Screening', desc: 'Professional screening assessments and personalised support plans.', accent: 'forest' },
  { icon: '☀️', title: 'Summer Workshops', desc: 'Intensive holiday programmes to consolidate learning and prepare for the year ahead.', accent: 'redwood' },
]

const features = [
  { title: 'Small Class Sizes', desc: 'Maximum 5 students per group — every child gets focused attention.' },
  { title: 'DBS-Checked Tutors', desc: 'All staff are fully DBS-cleared and First Aid trained for your peace of mind.' },
  { title: 'Free Initial Assessment', desc: "We start with a no-obligation assessment to identify exactly where your child is." },
  { title: 'Two Convenient Locations', desc: 'Centres in Retford and Doncaster, easily accessible across the region.' },
]

const testimonials = [
  {
    quote: "My daughter passed her 11+ with one of the highest scores in the county. The structured approach at Redwood made all the difference.",
    author: 'Parent, Retford'
  },
  {
    quote: "Within a term my son moved up two sets in maths at school. The teaching is patient, thorough and genuinely tailored.",
    author: 'Parent, Doncaster'
  },
  {
    quote: "The dyslexia screening and follow-up support gave us a clear path forward. We finally understood how to help our son learn.",
    author: 'Parent, Bawtry'
  },
]

export default function MarketingHome() {
  return (
    <div className="bg-cream text-forest-900 font-sans">
      {/* ─── Top nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-b-2 border-redwood-600/20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2">
            <RedwoodLogo variant="wordmark" size="md" />
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-forest-800">
            <a href="#subjects" className="hover:text-redwood-600 transition-colors">Subjects</a>
            <a href="#why" className="hover:text-redwood-600 transition-colors">Why Us</a>
            <a href="#testimonials" className="hover:text-redwood-600 transition-colors">Testimonials</a>
            <a href="#contact" className="hover:text-redwood-600 transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-sm font-semibold text-forest-700 hover:text-redwood-600 transition-colors px-3 py-1.5"
            >
              Portal Login
            </Link>
            <a
              href="tel:03330507765"
              className="hidden sm:inline-flex bg-redwood-600 hover:bg-redwood-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Free Assessment
            </a>
          </div>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section id="top" className="relative overflow-hidden bg-gradient-to-br from-forest-700 via-forest-600 to-forest-800 text-white">
        {/* Decorative patterns */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }} />
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-redwood-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-redwood-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block bg-redwood-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-5 shadow-sm">
              Tutoring · Retford & Doncaster
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-5">
              Teaching the way <span className="text-redwood-300 italic">your child learns</span>.
            </h1>
            <p className="text-lg text-forest-50 leading-relaxed mb-7 max-w-lg">
              Quality tuition in English, Maths, 11+ preparation and more — with experienced, DBS-checked teachers who tailor every lesson to the individual child.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="tel:03330507765"
                className="bg-redwood-600 hover:bg-redwood-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
              >
                Book a Free Assessment
              </a>
              <a
                href="#subjects"
                className="bg-white/10 hover:bg-white/20 backdrop-blur text-white border border-white/30 font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Explore Subjects
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-forest-100">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-redwood-400 rounded-full" />
                Ages 3–16
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-redwood-400 rounded-full" />
                Group sizes max 5
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-redwood-400 rounded-full" />
                DBS Cleared
              </div>
            </div>
          </div>

          {/* Right column: portal feature card */}
          <div className="relative">
            <div className="bg-white text-forest-900 rounded-2xl shadow-2xl p-7 sm:p-8 relative z-10 border-t-4 border-redwood-600">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-forest-100 text-forest-700 rounded-full flex items-center justify-center text-xl">
                  ✨
                </div>
                <div>
                  <span className="inline-block bg-redwood-100 text-redwood-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1">New</span>
                  <h3 className="font-serif text-lg font-bold text-forest-900">Online Lesson Portal</h3>
                </div>
              </div>
              <p className="text-sm text-forest-700 mb-4 leading-relaxed">
                Students get their own digital learning portal with personalised lesson plans, interactive worksheets, and live whiteboard sessions with their tutor.
              </p>
              <ul className="space-y-2.5 mb-6 text-sm text-forest-800">
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 bg-forest-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                  Auto-marked practice sheets with instant feedback
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 bg-forest-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                  Live whiteboard sessions with your tutor
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 bg-forest-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                  Progress tracking parents can see at a glance
                </li>
              </ul>
              <Link
                to="/login"
                className="block w-full text-center bg-forest-600 hover:bg-forest-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm"
              >
                Sign in to the portal →
              </Link>
            </div>
            {/* Decorative shapes */}
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-redwood-500 rounded-full -z-0 opacity-30" />
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-forest-400 rounded-full -z-0 opacity-30" />
          </div>
        </div>
      </section>

      {/* ─── Subjects ───────────────────────────────────────────────────── */}
      <section id="subjects" className="py-20 sm:py-24 bg-cream">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-redwood-600 font-bold text-sm uppercase tracking-widest">Our Programmes</span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-900 mt-3">Subjects we teach</h2>
            <div className="w-16 h-1 bg-redwood-600 mx-auto mt-4 rounded-full" />
            <p className="text-forest-700 mt-5 max-w-2xl mx-auto leading-relaxed">
              Structured learning programmes designed to build solid foundations and prepare students for every academic challenge ahead.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {subjects.map(s => {
              const accentBorder = s.accent === 'forest' ? 'border-l-forest-500' : 'border-l-redwood-500'
              const accentBg = s.accent === 'forest' ? 'bg-forest-100' : 'bg-redwood-100'
              return (
                <div key={s.title} className={`bg-white border border-forest-100 ${accentBorder} border-l-4 rounded-xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all`}>
                  <div className={`w-12 h-12 ${accentBg} rounded-lg flex items-center justify-center text-2xl mb-3`}>
                    {s.icon}
                  </div>
                  <h3 className="font-serif text-xl font-bold text-forest-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-forest-700 leading-relaxed">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Why us ─────────────────────────────────────────────────────── */}
      <section id="why" className="py-20 sm:py-24 bg-forest-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 75% 50%, white 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-redwood-300 font-bold text-sm uppercase tracking-widest">Why Redwood</span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold mt-3">A trusted home for your child's learning</h2>
            <div className="w-16 h-1 bg-redwood-400 mx-auto mt-4 rounded-full" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div key={f.title} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center hover:bg-white/10 transition-colors">
                <div className="w-14 h-14 mx-auto bg-redwood-500 text-white rounded-full flex items-center justify-center font-serif text-xl font-bold mb-4 shadow-lg">
                  {i + 1}
                </div>
                <h3 className="font-serif text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-forest-100 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ───────────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 sm:py-24 bg-cream">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-redwood-600 font-bold text-sm uppercase tracking-widest">From Our Families</span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-900 mt-3">What parents are saying</h2>
            <div className="w-16 h-1 bg-redwood-600 mx-auto mt-4 rounded-full" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <figure key={i} className="bg-white border border-forest-100 rounded-xl p-7 flex flex-col shadow-sm hover:shadow-md transition-shadow">
                <div className="text-redwood-500 text-5xl font-serif leading-none mb-3">“</div>
                <blockquote className="text-forest-800 text-sm leading-relaxed mb-5 flex-1 italic">{t.quote}</blockquote>
                <figcaption className="text-xs font-bold text-redwood-600 uppercase tracking-wider border-t border-forest-100 pt-3">
                  — {t.author}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA / Contact ─────────────────────────────────────────────── */}
      <section id="contact" className="py-20 sm:py-24 bg-redwood-700 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-redwood-600/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-forest-700/40 rounded-full blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-redwood-50 max-w-2xl mx-auto mb-8 leading-relaxed text-lg">
            Book a free initial assessment at one of our centres. We'll evaluate your child's current level and recommend a tailored learning programme.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            <a
              href="tel:03330507765"
              className="bg-white text-redwood-700 hover:bg-redwood-50 font-bold px-7 py-3.5 rounded-lg transition-colors shadow-lg text-base"
            >
              📞 Call 0333 050 7765
            </a>
            <a
              href="mailto:hello@redwoodscholars.co.uk"
              className="bg-forest-700 hover:bg-forest-800 text-white font-bold px-7 py-3.5 rounded-lg transition-colors shadow-lg text-base"
            >
              ✉ Email Us
            </a>
          </div>

          {/* Locations */}
          <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto text-left">
            <div className="bg-white text-forest-900 rounded-xl p-6 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 bg-redwood-100 text-redwood-700 rounded-full flex items-center justify-center text-sm font-bold">📍</span>
                <h3 className="font-serif text-lg font-bold">Retford Centre</h3>
              </div>
              <p className="text-sm text-forest-700 ml-10">74a Bridgegate, Retford DN22 7UZ</p>
            </div>
            <div className="bg-white text-forest-900 rounded-xl p-6 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 bg-forest-100 text-forest-700 rounded-full flex items-center justify-center text-sm font-bold">📍</span>
                <h3 className="font-serif text-lg font-bold">Doncaster Centre</h3>
              </div>
              <p className="text-sm text-forest-700 ml-10">Danum House, 6a South Parade, Doncaster DN1 2DY</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-forest-900 text-forest-100 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 text-redwood-300">
            <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="44" y="80" width="12" height="16" rx="1.5" fill="#5a1c10" />
              <path d="M50 6 L28 30 L72 30 Z" fill="currentColor" opacity="0.95" />
              <path d="M50 26 L22 52 L78 52 Z" fill="currentColor" opacity="0.85" />
              <path d="M50 46 L16 78 L84 78 Z" fill="currentColor" />
            </svg>
            <span className="font-serif font-bold text-base text-forest-100">Redwood Scholars Tuition</span>
          </div>
          <div className="flex items-center gap-5 text-forest-300 text-xs">
            <Link to="/login" className="hover:text-white transition-colors font-medium">Portal Login</Link>
            <a href="tel:03330507765" className="hover:text-white transition-colors">0333 050 7765</a>
            <span>© {new Date().getFullYear()} Redwood Scholars</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
