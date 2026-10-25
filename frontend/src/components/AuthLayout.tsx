import { useLocalizedView } from "../lib/i18n";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { view } = useLocalizedView();
  return view(<main className="auth-page"><div className="auth-layout">
    <aside className="auth-story">
      <div className="auth-brand"><Icon name="leaf" />NutriThai<span>.</span></div>
      <div className="auth-story-copy"><p className="eyebrow">A LITTLE BETTER, EVERY DAY</p><h2>กินดีขึ้นอีกนิด<br />ในแบบของคุณ</h2><p>บันทึกทีละมื้อ เห็นภาพรวมทั้งวัน<br />เริ่มดูแลตัวเองด้วยสิ่งเล็ก ๆ ในทุกวัน</p></div>
      <img src="/images/nutrithai-bowl.png" alt="" className="auth-bowl" />
      <div className="auth-story-features">{[{ icon: "bowl", title: "บันทึกง่าย", text: "เลือกอาหารและปริมาณที่กิน" }, { icon: "chart", title: "เห็นภาพรวม", text: "ติดตามพลังงานและสารอาหาร" }, { icon: "leaf", title: "เป้าหมายของคุณ", text: "ปรับให้เข้ากับแต่ละวัน" }].map(item => <div key={item.title}><Icon name={item.icon} /><div><strong>{item.title}</strong><span>{item.text}</span></div></div>)}</div>
      <p className="auth-story-footnote">ทีละมื้อ ทีละวัน · YOUR DAILY NOURISHMENT</p>
    </aside>
    <div className="auth-form-area">{children}</div>
  </div></main>);
}
