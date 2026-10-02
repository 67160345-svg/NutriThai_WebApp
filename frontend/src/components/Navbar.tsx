import type { ReactNode } from "react";
import type { Page } from "../types";

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  username: string;
  isGuest: boolean;
  onEditProfile: () => void;
  onSignOut: () => void;
}

const tabs: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "วันนี้", icon: "home" },
  { id: "logger", label: "เพิ่มอาหาร", icon: "plus" },
  { id: "history", label: "ประวัติอาหาร", icon: "clock" },
  { id: "ai-scan", label: "สแกนอาหาร AI", icon: "camera" },
  { id: "advice", label: "ข้อมูลเชิงลึก", icon: "chart" },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    camera: <><path d="M14 4h-4L8 7H4v13h16V7h-4l-2-3Z" /><circle cx="12" cy="13" r="3" /></>,
    chart: <><path d="M4 20v-6m6 6V4m6 16v-9m6 9V8" /></>,
    leaf: <><path d="M20 4c-7 0-13 3-13 10a6 6 0 0 0 6 6C20 20 20 12 20 4Z" /><path d="M4 21c2-5 6-8 11-11" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  };

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 text-2xl font-extrabold text-[#1a2820]">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#2d6e3e] text-white">
        <Icon name="leaf" className="h-6 w-6" />
      </span>
      <span>NutriThai<span className="text-[#2d6e3e]">.</span></span>
    </div>
  );
}

export default function Navbar({ page, onNavigate, username, isGuest, onEditProfile, onSignOut }: Props) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[232px] flex-col border-r border-[#e5e2da] bg-white px-5 py-[30px] md:flex">
        <div className="mb-[38px]"><BrandMark /></div>
        <div className="mb-4 text-[11px] font-bold tracking-[0.1em] text-[#2d6e3e]">YOUR DAILY NOURISHMENT</div>
        <nav aria-label="เมนูหลัก" className="space-y-1.5">
          {tabs.map((tab) => {
            const active = page === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(tab.id)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[15px] transition-colors ${
                  active ? "bg-[#edf4ee] text-[#2d6e3e]" : "text-[#596c5c] hover:bg-[#f8f5ef] hover:text-[#1a2820]"
                }`}
              >
                <Icon name={tab.icon} className="h-5 w-5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-b border-[#e5e2da] pb-3 text-xs leading-6 text-[#718078]">
          ทีละมื้อ ทีละวัน<br />ดูแลตัวเองในแบบของคุณ
        </div>
        <button type="button" onClick={onEditProfile} className="flex items-center gap-3 border-b border-[#e5e2da] py-4 text-left hover:text-[#2d6e3e]">
          <Icon name="user" className="h-6 w-6 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#1a2820]">{username}</span>
            <span className="block text-xs text-[#718078]">แก้ไขโปรไฟล์</span>
          </span>
        </button>
        <button type="button" onClick={onSignOut} className="flex items-center gap-3 py-4 text-left text-sm text-[#1a2820] hover:text-[#2d6e3e]">
          <Icon name="logout" className="h-5 w-5 shrink-0" />
          {isGuest ? "ออกจากโหมดผู้เยี่ยมชม" : "ออกจากระบบ"}
        </button>
      </aside>
      <nav aria-label="เมนูหลัก" className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5e2da] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-xl justify-around px-1">
          {tabs.map((tab) => {
            const active = page === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(tab.id)}
                className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors ${active ? "text-[#2d6e3e]" : "text-[#718078] hover:text-[#596c5c]"}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${active ? "bg-[#edf4ee]" : ""}`}>
                  <Icon name={tab.icon} className="h-5 w-5" />
                </span>
                <span className="whitespace-nowrap text-[9px] font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
