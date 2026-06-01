// Tour step definitions per role. Each step targets an element via a
// `data-tour="key"` attribute in the JSX.

export const managerTour = [
  {
    placement: 'center',
    title: 'Welcome to the Redwood portal',
    body: 'Quick 30-second tour of the manager dashboard so you can hit the ground running.',
  },
  {
    target: '[data-tour="tab-today"]',
    placement: 'bottom',
    title: 'Today',
    body: 'Your default landing — every lesson scheduled for today across the whole centre, with quick "Start" and "Mark attended" buttons.',
  },
  {
    target: '[data-tour="add-tutor"]',
    placement: 'bottom',
    title: 'Add tutors',
    body: 'Create tutor accounts so they can sign in and start teaching. They get their own dashboard view.',
  },
  {
    target: '[data-tour="add-student"]',
    placement: 'bottom',
    title: 'Add students',
    body: 'Create student accounts with their age, subject focus, and which days they come in for lessons.',
  },
  {
    target: '[data-tour="new-plan"]',
    placement: 'bottom',
    title: 'New lesson plan',
    body: 'Build a lesson plan with sheets from the library, plus IXL / paper / custom items. Plans are organised into sessions so you can plan weeks ahead.',
  },
  {
    target: '[data-tour="tab-calendar"]',
    placement: 'bottom',
    title: 'Calendar',
    body: 'See every session at a glance. Drag a session to a new date to reschedule, or click to edit details.',
  },
  {
    placement: 'center',
    title: 'You\'re all set',
    body: 'You can replay this tour anytime via the ? icon in the top-right of the navbar. Happy teaching!',
  },
]

export const tutorTour = [
  {
    placement: 'center',
    title: 'Welcome',
    body: 'Quick look at the tutor view — what\'s happening today and the students you teach.',
  },
  {
    target: '[data-tour="tab-today"]',
    placement: 'bottom',
    title: 'Today',
    body: 'See exactly who you\'re teaching today and start any live session in one click.',
  },
  {
    target: '[data-tour="tab-students"]',
    placement: 'bottom',
    title: 'Your students',
    body: 'Every student assigned to you, with their progress, last activity, and average score at a glance.',
  },
  {
    target: '[data-tour="new-plan"]',
    placement: 'bottom',
    title: 'Build lesson plans',
    body: 'Create plans for your students, organise items into sessions, and pull from the worksheet library or add IXL/paper items.',
  },
  {
    placement: 'center',
    title: 'During a lesson',
    body: 'Inside a live session you control which sheet is on screen, the student types answers, and you mark them correct or wrong in real-time. Unfinished items roll over automatically.',
  },
]

export const studentTour = [
  {
    placement: 'center',
    title: 'Hi! Welcome to your portal',
    body: 'A quick tour of where things live so you can get started.',
  },
  {
    target: '[data-tour="live-button"]',
    placement: 'bottom',
    title: 'Join your live lesson',
    body: 'When your tutor starts a session, click this big button to join them. You\'ll see the same worksheet and you can type your answers in.',
  },
  {
    target: '[data-tour="progress-bar"]',
    placement: 'bottom',
    title: 'Your progress',
    body: 'Tracks how many sheets you\'ve completed. Each completed sheet shows your score.',
  },
  {
    target: '[data-tour="lesson-items"]',
    placement: 'top',
    title: 'Your sheets',
    body: 'Click any sheet to open it and have a go. Your tutor will mark it after, or you might get an automatic score if it\'s a quick-answer sheet.',
  },
  {
    placement: 'center',
    title: 'That\'s it!',
    body: 'Have fun learning. Your tutor will be there for live lessons when they say. Click the ? in the top corner if you want this tour again.',
  },
]

export function tourForRole(role) {
  if (role === 'manager') return managerTour
  if (role === 'tutor') return tutorTour
  if (role === 'student') return studentTour
  return null
}
