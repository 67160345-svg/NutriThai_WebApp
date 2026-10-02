import { useState } from "react";
import type { FormEvent } from "react";
import type { HealthProfile } from "../types";
import type { ApiUser } from "../lib/api";
import { login, requestPasswordReset, signUp } from "../lib/api";
import { computeHealthMetrics } from "../lib/health";

interface Props {
  onGuest: (profile: HealthProfile) => void;
  onAuthenticated: (user: ApiUser) => void;
}

export default function AuthPage({ onGuest, onAuthenticated }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const continueAsGuest = () => {
    onGuest({
      gender: "male",
      weight: 65,
      height: 170,
      age: 25,
      activityLevel: "moderate",
      goal: "maintain",
      ...computeHealthMetrics("male", 65, 170, 25, "moderate", "maintain"),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (!isLogin && !isResetMode && password !== confirmation) {
      setErrorMsg("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      if (isResetMode) {
        await requestPasswordReset(email);
        setSuccessMsg("หากมีบัญชีที่ใช้อีเมลนี้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้");
      } else if (isLogin) {
        onAuthenticated(await login(email, password));
      } else {
        const result = await signUp(email, password, username.trim());
        if (result.authenticated) onAuthenticated(result.user);
        else setSuccessMsg("สมัครสมาชิกแล้ว กรุณายืนยันอีเมลจากกล่องจดหมายก่อนเข้าสู่ระบบ");
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (loginMode: boolean) => {
    setIsLogin(loginMode);
    setIsResetMode(false);
    setErrorMsg("");
    setSuccessMsg("");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f5ef] px-4 py-8">
      <section className="w-full max-w-[448px] border-y border-[#e5e2da] bg-[#f8f5ef] px-6 py-8 sm:px-10 sm:py-9">
        <header className="mb-7 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#2d6e3e] text-white">
            <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 4c-7 0-13 3-13 10a6 6 0 0 0 6 6C20 20 20 12 20 4Z" />
              <path d="M4 21c2-5 6-8 11-11" />
            </svg>
          </span>
          <h1 className="text-2xl font-extrabold text-[#1a2820]">NutriThai</h1>
          <p className="mt-1 text-sm text-[#596c5c]">บันทึกอาหาร ดูแลสุขภาพ ง่ายๆ</p>
        </header>

        {!isResetMode && (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-[#edf4ee] p-1" role="tablist" aria-label="เลือกการเข้าใช้งาน">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => switchMode(true)}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition ${isLogin ? "bg-white text-[#1a2820] shadow-sm" : "text-[#596c5c] hover:text-[#1a2820]"}`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => switchMode(false)}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition ${!isLogin ? "bg-white text-[#1a2820] shadow-sm" : "text-[#596c5c] hover:text-[#1a2820]"}`}
            >
              สมัครสมาชิก
            </button>
          </div>
        )}

        {isResetMode && (
          <div className="mb-5">
            <button type="button" onClick={() => { setIsResetMode(false); setErrorMsg(""); setSuccessMsg(""); }} className="mb-4 text-sm font-semibold text-[#2d6e3e] hover:underline">
              ‹ กลับ
            </button>
            <h2 className="text-xl font-bold text-[#1a2820]">ลืมรหัสผ่าน</h2>
            <p className="mt-1 text-sm text-[#596c5c]">กรอกอีเมลของคุณ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้</p>
          </div>
        )}

        {errorMsg && <div role="alert" className="mb-4 rounded-xl border border-[#f0c9c4] bg-[#fff1ef] p-3 text-sm text-[#9d302b]">{errorMsg}</div>}
        {successMsg && <div role="status" className="mb-4 rounded-xl border border-[#b9d9c4] bg-[#edf4ee] p-3 text-sm text-[#245a33]">{successMsg}</div>}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {!isLogin && !isResetMode && (
            <label className="block text-sm font-medium text-[#1a2820]" htmlFor="auth-username">
              ชื่อ
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ชื่อที่ใช้แสดง"
                className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#e5e2da] bg-white px-4 text-sm text-[#1a2820] placeholder:text-[#718078]"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-[#1a2820]" htmlFor="auth-email">
            อีเมล
            <input
              id="auth-email"
              aria-label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#e5e2da] bg-white px-4 text-sm text-[#1a2820] placeholder:text-[#718078]"
            />
          </label>
          {!isResetMode && (
            <label className="block text-sm font-medium text-[#1a2820]" htmlFor="auth-password">
              รหัสผ่าน
              <span className="relative mt-1.5 block">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  className="min-h-12 w-full rounded-2xl border border-[#e5e2da] bg-white px-4 pr-12 text-sm text-[#1a2820] placeholder:text-[#718078]"
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} className="absolute inset-y-0 right-3 grid place-items-center text-[#596c5c]">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </span>
            </label>
          )}
          {!isLogin && !isResetMode && (
            <label className="block text-sm font-medium text-[#1a2820]" htmlFor="auth-confirm-password">
              ยืนยันรหัสผ่าน
              <input
                id="auth-confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#e5e2da] bg-white px-4 text-sm text-[#1a2820] placeholder:text-[#718078]"
              />
            </label>
          )}

          {isLogin && !isResetMode && (
            <div className="-mt-1 text-right">
              <button type="button" onClick={() => { setIsResetMode(true); setErrorMsg(""); setSuccessMsg(""); }} className="text-sm text-[#2d6e3e] hover:underline">
                ลืมรหัสผ่าน?
              </button>
            </div>
          )}

          <button type="submit" aria-label={isResetMode ? "ส่งลิงก์ตั้งรหัสผ่านใหม่" : undefined} disabled={loading} className="min-h-12 w-full rounded-2xl bg-[#2d6e3e] px-4 text-sm font-bold text-white transition hover:bg-[#245a33] disabled:opacity-60">
            {loading ? "กำลังดำเนินการ..." : isResetMode ? "ส่งลิงก์รีเซ็ต" : isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>

        {!isResetMode && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-[#718078]">
              <span className="h-px flex-1 bg-[#e5e2da]" />
              <span>หรือ</span>
              <span className="h-px flex-1 bg-[#e5e2da]" />
            </div>
            <button type="button" onClick={continueAsGuest} className="min-h-12 w-full rounded-2xl border border-[#e5e2da] bg-transparent px-4 text-sm font-semibold text-[#1a2820] transition hover:bg-white">
              ทดลองใช้โดยไม่สมัคร (โหมดผู้เยี่ยมชม)
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-[#718078]">ข้อมูลในโหมดผู้เยี่ยมชมจะหายเมื่อรีเฟรชหรือปิดหน้า</p>
          </>
        )}
      </section>
    </main>
  );
}
