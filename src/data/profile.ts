/**
 * Factual profile data.
 *
 * Every field here is sourced from Ayush's own material:
 *   - github.com/AyushChangedia/AyushChangedia  (docs/index.html — the live site)
 *   - resume/Ayush_Changedia_Resume.tex          (the LaTeX résumé source)
 *
 * Nothing in this file is invented. If a fact is not in one of those two
 * sources it does not belong here.
 */

export const profile = {
  firstName: 'Ayush',
  lastName: 'Changedia',
  fullName: 'Ayush Sameer Changedia',
  shortName: 'Ayush S. Changedia',
  role: 'AI Engineer & Backend Developer',
  location: 'Pune, India',
  availability: 'Open to internships & collaborations',

  /** The rotating self-descriptions used on the current site. */
  facets: [
    'AI Engineer',
    'Backend Developer',
    'Automation Addict',
    'Trading-Bot Builder',
    'LLM Tinkerer',
  ],

  /** The line the whole experience is built around. */
  thesis:
    'Software should not have to repeat itself. Neither should the people using it.',

  bio: [
    'I am a Computer Science student at MIT World Peace University who got a little too curious about why software has to be repetitive — and never really recovered.',
    'Three internships later, that curiosity has a shape: an LLM-powered résumé-screening tool built with Python, FastAPI and OpenAI APIs; scalable Node.js, Express and PostgreSQL REST APIs for product, order and payment flows; and messy marketing data turned into Power BI dashboards people actually make decisions with.',
    'Off the clock I automate my own hobbies too. My ORB Strategy Backtester runs opening-range-breakout backtests on Bank Nifty futures through a custom TradingView MCP integration. When there is a CTF running, I am probably in it, exploiting something that technically should not work.',
  ],

  education: {
    institution: 'MIT World Peace University',
    location: 'Pune, India',
    degree: 'B.Sc. Computer Science',
    cgpa: '8.2 / 10',
    period: '2025 — 2029',
    priorResults: 'Class XII: 80%  ·  Class X: 70%',
  },

  /** Verified numbers only — each one traces to the résumé. */
  metrics: [
    { value: '3×', label: 'Internships', detail: 'AI · Backend · Data' },
    { value: 'Top 1%', label: 'Of 720+ applicants', detail: 'Internshala Student Partner' },
    { value: '57.5%', label: 'Backtest win rate', detail: '120 trades · Bank Nifty' },
    { value: '8.2', label: 'CGPA / 10', detail: 'MIT-WPU' },
  ],

  certifications: [
    'HackerRank — SQL (Advanced)',
    'HackerRank — SQL (Intermediate)',
    'HackerRank — Problem Solving',
    'HackerRank — Critical Thinking',
    'Ethical AI Masterclass — Cybrent × MIT-WPU',
    'C Programming (Intermediate) — University of Alabama',
    'Certificate of Excellence — Mindenious',
  ],

  ctf: 'Active participant in Capture-the-Flag security competitions and CTF-style hackathons.',
} as const;

export type Profile = typeof profile;
