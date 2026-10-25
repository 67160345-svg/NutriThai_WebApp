import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 1 3h4l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  camera: <><path d="M14 4h-4L8 7H4v13h16V7h-4l-2-3Z" /><circle cx="12" cy="13" r="3" /></>,
  chart: <path d="M4 20v-6m6 6V4m6 16v-9m6 9V8" />,
  leaf: <><path d="M20 4c-7 0-13 3-13 10a6 6 0 0 0 6 6C20 20 20 12 20 4Z" /><path d="M4 21c2-5 6-8 11-11" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  bowl: <><path d="M3 11h18a9 9 0 0 1-18 0ZM8 21h8M8 7c-2-2 2-2 0-4m6 4c-2-2 2-2 0-4" /></>,
  protein: <path d="M14 4a5 5 0 1 1-7 7l-3 3 1 2-2 2 3 3 2-2 2 1 3-3a5 5 0 0 1 1-13Z" />,
  grain: <path d="m5 21 14-18M11 13c-6 0-7-4-6-6 4 0 7 2 6 6Zm0 0c5 2 9 0 9-4-5-1-8 0-9 4ZM15 8c-3-2-3-5-1-7 3 1 4 4 1 7Z" />,
  drop: <><path d="M12 2S4 11 4 16a8 8 0 0 0 16 0C20 11 12 2 12 2Z" /><path d="M8 16a4 4 0 0 0 4 4" /></>,
};

export default function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <svg aria-hidden="true" className={`nt-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.bowl}</svg>;
}
