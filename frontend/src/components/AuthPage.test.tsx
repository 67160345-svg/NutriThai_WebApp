import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./AuthPage";
import PasswordRecovery from "./PasswordRecovery";

const authMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  login: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  requestPasswordReset: authMocks.requestPasswordReset,
  login: authMocks.login,
  signUp: authMocks.signUp,
  updatePassword: authMocks.updateUser,
}));

describe("password recovery", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requestPasswordReset.mockResolvedValue({ status: "ok" });
    authMocks.updateUser.mockResolvedValue({ status: "ok" });
  });

  it("sends a reset link and displays a neutral confirmation", async () => {
    render(<AuthPage onGuest={vi.fn()} onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "ลืมรหัสผ่าน?" }));
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" }));

    await waitFor(() => expect(authMocks.requestPasswordReset).toHaveBeenCalledWith("user@example.com"));
    expect((await screen.findByRole("status")).textContent).toContain("ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้");
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    render(<PasswordRecovery onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่", { exact: true }), { target: { value: "password-one" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่", { exact: true }), { target: { value: "password-two" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));

    expect((await screen.findByRole("alert")).textContent).toContain("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    expect(authMocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and completes recovery", async () => {
    const onComplete = vi.fn();
    render(<PasswordRecovery onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่", { exact: true }), { target: { value: "password-one" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่", { exact: true }), { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }));

    await waitFor(() => expect(authMocks.updateUser).toHaveBeenCalledWith("password-one"));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("signs in with email and password", async () => {
    const onAuthenticated = vi.fn();
    authMocks.login.mockResolvedValue({ id: "user-1", email: "user@example.com", username: "user" });
    render(<AuthPage onGuest={vi.fn()} onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "user@example.com" } });
    fireEvent.change(document.getElementById("auth-password")!, { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    await waitFor(() => expect(authMocks.login).toHaveBeenCalledWith("user@example.com", "password-one"));
    expect(onAuthenticated).toHaveBeenCalledWith({ id: "user-1", email: "user@example.com", username: "user" });
  });

  it("validates matching signup passwords and supports guest mode", async () => {
    const onGuest = vi.fn();
    const onAuthenticated = vi.fn();
    render(<AuthPage onGuest={onGuest} onAuthenticated={onAuthenticated} />);

    fireEvent.click(screen.getByRole("tab", { name: "สมัครสมาชิก" }));
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "new-user" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "new@example.com" } });
    fireEvent.change(document.getElementById("auth-password")!, { target: { value: "password-one" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value: "password-two" } });
    fireEvent.click(screen.getByRole("button", { name: "สมัครสมาชิก" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(authMocks.signUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ทดลองใช้โดยไม่สมัคร/ }));
    expect(onGuest).toHaveBeenCalledOnce();
    expect(onGuest.mock.calls[0][0]).toMatchObject({ gender: "male", goal: "maintain" });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("shows signup confirmation when email verification is required", async () => {
    authMocks.signUp.mockResolvedValue({ authenticated: false });
    render(<AuthPage onGuest={vi.fn()} onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "สมัครสมาชิก" }));
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "new-user" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "new@example.com" } });
    fireEvent.change(document.getElementById("auth-password")!, { target: { value: "password-one" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "สมัครสมาชิก" }));

    await waitFor(() => expect(authMocks.signUp).toHaveBeenCalledWith("new@example.com", "password-one", "new-user"));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("returns to sign-in from password reset mode and displays API errors", async () => {
    authMocks.requestPasswordReset.mockRejectedValueOnce(new Error("API unavailable"));
    render(<AuthPage onGuest={vi.fn()} onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ลืมรหัสผ่าน?" }));
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "‹ กลับ" }));
    expect(screen.getByRole("tab", { name: "เข้าสู่ระบบ" })).toBeTruthy();
  });
});
