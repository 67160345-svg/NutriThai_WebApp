import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiJson } from "./api";

describe("backend API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses same-origin HttpOnly-cookie sessions and refreshes once after expiry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/v1/auth/session");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => call[1].credentials)).toEqual(["include", "include", "include"]);
    expect(fetchMock.mock.calls[0][1].headers.has("Authorization")).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("does not retry an unauthenticated request when no refresh session exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "กรุณาเข้าสู่ระบบ" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/v1/auth/session");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces backend error messages to the UI layer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "บันทึกไม่สำเร็จ" }), { status: 400 }),
    ));

    await expect(apiJson("/api/v1/profile")).rejects.toThrow("บันทึกไม่สำเร็จ");
  });

  it("reports a malformed successful API response instead of masking it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

    await expect(apiJson("/api/v1/profile")).rejects.toThrow("Backend ส่งข้อมูลตอบกลับที่ไม่ถูกต้อง");
  });
});
