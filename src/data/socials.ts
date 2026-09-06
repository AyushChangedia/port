export interface Social {
  id: string;
  label: string;
  /** The value shown on screen — readable, not a raw URL. */
  handle: string;
  href: string;
  external: boolean;
}

export const email = 'ayushc7711@gmail.com';

export const socials: Social[] = [
  {
    id: 'email',
    label: 'Email',
    handle: email,
    href: `mailto:${email}`,
    external: false,
  },
  {
    id: 'github',
    label: 'GitHub',
    handle: 'github.com/AyushChangedia',
    href: 'https://github.com/AyushChangedia',
    external: true,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    handle: 'linkedin.com/in/ayushchangedia',
    href: 'https://www.linkedin.com/in/ayushchangedia/',
    external: true,
  },
];

export const resume = {
  label: 'Résumé',
  href: 'Ayush_Changedia_Resume.pdf',
};
