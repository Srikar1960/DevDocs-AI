const PATHS = {
  plus: "M12 5v14|M5 12h14",
  send: "M12 19V5|M5 12l7-7 7 7",
  stop: "M7 7h10v10H7z",
  trash: "M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6|M10 11v6|M14 11v6",
  refresh: "M21 4v6h-6|M3 20v-6h6|M5.6 9A8 8 0 0 1 19 7l2 3|M3 14l2 3a8 8 0 0 0 13.4-2",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  chevron: "M9 18l6-6-6-6",
  menu: "M3 12h18|M3 6h18|M3 18h18",
  close: "M18 6L6 18|M6 6l12 12",
  copy: "M9 9h11v11H9z|M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  check: "M20 6L9 17l-5-5",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3",
  alert: "M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  layers: "M12 2L2 7l10 5 10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  grid: "M3 3h7v7H3z|M14 3h7v7h-7z|M14 14h7v7h-7z|M3 14h7v7H3z",
  list: "M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10",
};

export function Icon({ name, size = 18, ...rest }) {
  if (!PATHS[name]) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {PATHS[name].split("|").map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M13 8c-3 0-3 2-3 4s-1 3-2 3.5c1 .5 2 1.5 2 3.5s0 4 3 4M19 8c3 0 3 2 3 4s1 3 2 3.5c-1 .5-2 1.5-2 3.5s0 4-3 4"
            stroke="var(--paper)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="9" y="23" width="14" height="3.5" rx="1.7" fill="var(--mark)" />
    </svg>
  );
}
