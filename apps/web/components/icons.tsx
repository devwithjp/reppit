/** The whole icon set: two solid triangles. Safe for client components. */
export const UpTriangle = ({ w = 15, h = 9 }: { w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 15 9" fill="currentColor" aria-hidden="true"><path d="M7.5 0 15 9H0z" /></svg>
);
export const DownTriangle = ({ w = 15, h = 9 }: { w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 15 9" fill="currentColor" aria-hidden="true"><path d="M7.5 9 0 0h15z" /></svg>
);
