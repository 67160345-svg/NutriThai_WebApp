import { useState } from "react";
import type { FormEvent } from "react";
import { updatePassword } from "../lib/api";

interface Props {
  onComplete: () => void;
}

export default function PasswordRecovery({ onComplete }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (password !== confirmation) {
      setErrorMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setIsSaving(true);
    try {
      await updatePassword(password);
      onComplete();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถเปลี่ยนรหัสผ่านได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-[22px] border border-[#e5e2da] bg-white p-6 shadow-sm sm:p-10">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2820]">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-2 text-sm text-[#596c5c]">ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร</p>
        </div>
        {errorMessage && <div role="alert" className="rounded-xl border border-[#f4c9c4] bg-[#fff1ef] p-3 text-sm text-[#b84444]">{errorMessage}</div>}
        <label className="block text-sm font-semibold text-[#1a2820]">
          รหัสผ่านใหม่
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#e5e2da] bg-[#f8f5ef] px-3.5 py-3 text-sm text-[#1a2820]"
          />
        </label>
        <label className="block text-sm font-semibold text-[#1a2820]">
          ยืนยันรหัสผ่านใหม่
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#e5e2da] bg-[#f8f5ef] px-3.5 py-3 text-sm text-[#1a2820]"
          />
        </label>
        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-xl bg-[#2d6e3e] py-3.5 text-sm font-bold text-white transition hover:bg-[#245a33] disabled:opacity-60"
        >
          {isSaving ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
        </button>
      </form>
    </main>
  );
}
