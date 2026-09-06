export interface Role {
  id: string;
  title: string;
  org: string;
  place: string;
  period: string;
  points: string[];
  tech?: string[];
}

/** Professional internships, most recent first. */
export const experience: Role[] = [
  {
    id: 'neuralforge',
    title: 'AI Engineering Intern',
    org: 'NeuralForge Labs',
    place: 'Remote',
    period: 'May 2026 — Jun 2026',
    points: [
      'Built an LLM-powered résumé-screening tool that automates first-round candidate shortlisting, parsing and ranking résumés through an OpenAI-driven scoring pipeline served over FastAPI.',
    ],
    tech: ['Python', 'FastAPI', 'OpenAI APIs', 'LLMs'],
  },
  {
    id: 'ytenest',
    title: 'Software Development Intern',
    org: 'yteNest Technologies',
    place: 'Remote',
    period: 'Apr 2026 — May 2026',
    points: [
      'Developed scalable REST APIs for product, order and payment workflows.',
      'Implemented JWT authentication, input validation and optimized SQL queries, improving API performance and security.',
    ],
    tech: ['Node.js', 'Express.js', 'PostgreSQL', 'JWT'],
  },
  {
    id: 'mindenious',
    title: 'Data Analytics Intern',
    org: 'Mindenious',
    place: 'Remote',
    period: 'Jan 2026 — Mar 2026',
    points: [
      'Analyzed website, marketing and sales data using SQL, Excel, Power BI, Python (Pandas) and Google Analytics 4.',
      'Built dashboards tracking conversion rates, customer behaviour and campaign ROI, enabling data-driven marketing decisions.',
    ],
    tech: ['SQL', 'Power BI', 'Pandas', 'Google Analytics 4'],
  },
];

/** Leadership and additional experience, from the résumé. */
export const leadership: Role[] = [
  {
    id: 'internshala',
    title: 'Internshala Student Partner',
    org: 'Internshala · MIT-WPU Campus',
    place: 'Pune, India',
    period: 'Mar 2026 — Apr 2026',
    points: [
      'Selected as 1 of 7 partners from 720+ applicants (top 1%); onboarded 29 students and mentored them on upskilling paths.',
    ],
  },
  {
    id: 'digital-marketing',
    title: 'Digital Marketing',
    org: 'Mindenious',
    place: 'Remote',
    period: 'Mar 2026',
    points: [
      'Closed 27 deals across 12 client accounts, owning the full cycle from outreach to closure.',
    ],
  },
  {
    id: 'fundraising',
    title: 'Fundraising Intern',
    org: 'NayePankh Foundation & She Can Foundation',
    place: 'Remote',
    period: 'May 2026 — Jun 2026',
    points: ['Drove donation campaigns funding education access for underprivileged children.'],
  },
];
