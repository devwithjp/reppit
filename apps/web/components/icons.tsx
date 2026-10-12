/** The icon set: vote arrows and a magnifier. Safe for client components. */
export const UpTriangle = ({ w = 18, h = 18 }: { w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 2.5 2.5 10.5H7v7h6v-7h4.5z" />
  </svg>
);
export const DownTriangle = ({ w = 18, h = 18 }: { w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 17.5 2.5 9.5H7v-7h6v7h4.5z" />
  </svg>
);
export const SearchIcon = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06zM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0" />
  </svg>
);
