// One authored icon set: 24px grid, 1.6 stroke, round caps. Icons are decorative unless the caller labels them.
import type { ReactNode } from 'react';

export type IconName =
  | 'layers' | 'cube' | 'code' | 'board' | 'chart' | 'search' | 'home' | 'network' | 'shield' | 'db' | 'link' | 'pulse'
  | 'clock' | 'grid' | 'list' | 'bulb' | 'bolt' | 'check' | 'alert' | 'info' | 'plus' | 'minus' | 'expand' | 'play' | 'pause'
  | 'prev' | 'next' | 'eye' | 'chevron' | 'agent' | 'doc' | 'target' | 'users' | 'flag' | 'pin' | 'external' | 'bell' | 'menu'
  | 'lock' | 'radar' | 'book' | 'question';

const P = (d: string) => <path d={d} />;

const ICONS: Readonly<Record<IconName, ReactNode>> = {
  layers: <>{P('M12 3 3 8l9 5 9-5-9-5Z')}{P('M3 12.5l9 5 9-5')}{P('M3 17l9 5 9-5')}</>,
  cube: <>{P('M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z')}{P('M4 7.5 12 12l8-4.5')}{P('M12 12v9')}</>,
  code: <>{P('m9 8-4 4 4 4')}{P('m15 8 4 4-4 4')}{P('m13.5 6-3 12')}</>,
  board: <>{P('M4 4h7v16H4z')}{P('M13 4h7v9h-7z')}</>,
  chart: <>{P('M5 20V11')}{P('M12 20V4')}{P('M19 20v-6')}</>,
  search: <><circle cx="11" cy="11" r="6.5" />{P('m16 16 4.5 4.5')}</>,
  home: <>{P('m4 11 8-7 8 7')}{P('M6 10v10h12V10')}</>,
  network: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" />{P('m7.8 7.2 8.2.2')}{P('m7 8 4 8')}{P('m17 9-4 7.5')}</>,
  shield: <>{P('M12 3 5 6v5.5c0 4.2 3 7.7 7 9 4-1.3 7-4.8 7-9V6l-7-3Z')}{P('m9 12 2.2 2.2L15.5 10')}</>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="3" />{P('M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6')}{P('M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6')}</>,
  link: <>{P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1')}{P('M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1')}</>,
  pulse: <>{P('M3 12h4l2.5-6 4 12 2.5-6H21')}</>,
  clock: <><circle cx="12" cy="12" r="8.5" />{P('M12 7.5V12l3 2')}</>,
  grid: <>{P('M4 4h7v7H4z')}{P('M13 4h7v7h-7z')}{P('M4 13h7v7H4z')}{P('M13 13h7v7h-7z')}</>,
  list: <>{P('M8 6h12')}{P('M8 12h12')}{P('M8 18h12')}{P('M4 6h.01')}{P('M4 12h.01')}{P('M4 18h.01')}</>,
  bulb: <>{P('M9 18h6')}{P('M10 21h4')}{P('M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z')}</>,
  bolt: <>{P('M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z')}</>,
  check: <>{P('m5 12.5 4.5 4.5L19 7.5')}</>,
  alert: <>{P('M12 4 2.8 19.5h18.4L12 4Z')}{P('M12 10v4.5')}{P('M12 17.3h.01')}</>,
  info: <><circle cx="12" cy="12" r="8.5" />{P('M12 11v5')}{P('M12 8h.01')}</>,
  plus: <>{P('M12 5v14')}{P('M5 12h14')}</>,
  minus: <>{P('M5 12h14')}</>,
  expand: <>{P('M4 9V4h5')}{P('M20 9V4h-5')}{P('M4 15v5h5')}{P('M20 15v5h-5')}</>,
  play: <>{P('M8 5.5v13l11-6.5-11-6.5Z')}</>,
  pause: <>{P('M8 5v14')}{P('M16 5v14')}</>,
  prev: <>{P('M7 5v14')}{P('m18 6-8 6 8 6V6Z')}</>,
  next: <>{P('M17 5v14')}{P('m6 6 8 6-8 6V6Z')}</>,
  eye: <>{P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z')}<circle cx="12" cy="12" r="3" /></>,
  chevron: <>{P('m6 9 6 6 6-6')}</>,
  agent: <><rect x="5" y="7" width="14" height="11" rx="3" />{P('M12 7V4')}{P('M9.5 12h.01')}{P('M14.5 12h.01')}{P('M9.5 15.5h5')}</>,
  doc: <>{P('M7 3h7l4 4v14H7z')}{P('M14 3v4h4')}{P('M10 12h5')}{P('M10 16h5')}</>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" />{P('M12 12h.01')}</>,
  users: <><circle cx="9" cy="9" r="3" />{P('M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5')}{P('M16 6.5a3 3 0 0 1 0 5.5')}{P('M17.5 14.7c1.6.5 2.7 1.9 3 4.3')}</>,
  flag: <>{P('M6 21V4')}{P('M6 5h11l-2 4 2 4H6')}</>,
  pin: <>{P('M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10C5.5 15.3 12 21 12 21Z')}<circle cx="12" cy="10" r="2.3" /></>,
  external: <>{P('M14 4h6v6')}{P('M20 4 10.5 13.5')}{P('M18 14v5H5V6h5')}</>,
  bell: <>{P('M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z')}{P('M10 21h4')}</>,
  menu: <>{P('M4 7h16')}{P('M4 12h16')}{P('M4 17h16')}</>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" />{P('M8 10.5V8a4 4 0 0 1 8 0v2.5')}</>,
  radar: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" />{P('M12 12 18 6')}</>,
  book: <>{P('M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Z')}{P('M5 16a4 4 0 0 1 4-4h9')}</>,
  question: <><circle cx="12" cy="12" r="8.5" />{P('M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.8')}{P('M12 16.6h.01')}</>,
};

interface Props {
  readonly name: IconName;
  readonly size?: number;
  readonly label?: string;
  readonly className?: string;
}

export function Icon({ name, size = 18, label, className }: Props) {
  return (
    <svg
      className={`kv2-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
