import { describe, expect, it } from "vitest";
import { hasThaiName, thaiFirst } from "./foodOrdering";

describe("Thai-first presentation", () => {
  it("uses actual Thai text rather than a populated English fallback", () => {
    expect(hasThaiName({ nameTh: "Rice" })).toBe(false);
    expect(hasThaiName({ nameTh: "  " })).toBe(false);
    expect(hasThaiName({ nameTh: "ข้าว Rice" })).toBe(true);
  });
  it("keeps English foods and preserves order within each language", () => {
    const items = [{ nameTh: "Apple" }, { nameTh: "ข้าว" }, { nameTh: "Banana" }, { nameTh: "ปลา" }];
    expect(thaiFirst(items, item => item).map(item => item.nameTh)).toEqual(["ข้าว", "ปลา", "Apple", "Banana"]);
    expect(items[0].nameTh).toBe("Apple");
  });
});
