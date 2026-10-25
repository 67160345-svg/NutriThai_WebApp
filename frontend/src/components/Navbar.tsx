import { RawText, useLocalizedView } from "../lib/i18n";
import type { Page } from "../types";
import Icon from "./Icon";

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  username: string;
  isGuest: boolean;
  onEditProfile: () => void;
  onSignOut: () => void;
}

const tabs: { id: Page; label: string; short: string; icon: string }[] = [
  { id: "dashboard", label: "วันนี้", short: "วันนี้", icon: "home" },
  { id: "logger", label: "เพิ่มอาหาร", short: "เพิ่มอาหาร", icon: "plus" },
  { id: "history", label: "ประวัติอาหาร", short: "ประวัติ", icon: "clock" },
  { id: "ai-scan", label: "สแกนอาหาร AI", short: "สแกน AI", icon: "camera" },
  { id: "advice", label: "ข้อมูลเชิงลึก", short: "ข้อมูลเชิงลึก", icon: "chart" },
];

export default function Navbar({ page, onNavigate, username, isGuest, onEditProfile, onSignOut }: Props) {
  const { view } = useLocalizedView();
  return view(<>
    <aside className="app-sidebar">
      <div className="nt-brand"><Icon name="leaf" /><span>NutriThai<span className="brand-dot">.</span></span></div>
      <p className="sidebar-caption">YOUR DAILY NOURISHMENT</p>
      <nav aria-label="เมนูหลัก" className="sidebar-nav">
        {tabs.map(tab => <button key={tab.id} type="button" aria-current={page === tab.id ? "page" : undefined} onClick={() => onNavigate(tab.id)} className={`sidebar-link ${page === tab.id ? "is-active" : ""}`}>
          <Icon name={tab.icon} /><span>{tab.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Icon name="leaf" /><p>ทีละมื้อ ทีละวัน<br /><span>ดูแลตัวเองในแบบของคุณ</span></p></div>
        <button type="button" onClick={onEditProfile} className="sidebar-profile">
          <span className="profile-avatar"><Icon name="user" /></span>
          <span className="min-w-0"><strong className="block truncate"><RawText>{username}</RawText></strong><span className="block text-xs">แก้ไขโปรไฟล์</span></span>
        </button>
        <button type="button" onClick={onSignOut} className="sidebar-signout"><Icon name="logout" />{isGuest ? "ออกจากโหมดผู้เยี่ยมชม" : "ออกจากระบบ"}</button>
      </div>
    </aside>
    <nav aria-label="เมนูหลัก" className="mobile-nav">
      {tabs.map(tab => <button key={tab.id} type="button" aria-label={tab.label} aria-current={page === tab.id ? "page" : undefined} onClick={() => onNavigate(tab.id)} className={page === tab.id ? "is-active" : ""}>
        <span className="mobile-nav-icon"><Icon name={tab.icon} /></span><span>{tab.short}</span>
      </button>)}
    </nav>
  </>);
}
