import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Food, FoodLog } from "../types";
import FoodLogger from "./FoodLogger";
import FoodLogEditor from "./FoodLogEditor";
import CustomFoodForm from "./CustomFoodForm";
import History from "./History";
import { availableUnits, basisLabel, consumedLabel, toServings } from "../lib/portions";
const mocks = vi.hoisted(() => ({ readFoods: vi.fn() }));
vi.mock("../lib/foodLogs", async importOriginal => ({...await importOriginal<typeof import("../lib/foodLogs")>(), readFoods: mocks.readFoods}));
const rice: Food = {id:1,name:"Rice",nameTh:"ข้าว",category:"food",source:"catalog",calories:130,protein:3,carbs:28,fat:1,sugar:0,fiber:1,servingSize:100,servingUnit:"g",servingLabel:"กรัม"};
const milk: Food = {...rice,id:0,customId:"private-1",source:"custom",name:"นมของฉัน",nameTh:"นมของฉัน",category:"drink",calories:60,servingUnit:"ml",servingLabel:"มิลลิลิตร"};
const log: FoodLog = {id:"log-1",food:rice,mealType:"lunch",servings:1.5,loggedAt:new Date("2026-01-01T12:00:00")};
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
beforeEach(() => {vi.clearAllMocks();mocks.readFoods.mockResolvedValue([rice]);});
afterEach(cleanup);

describe("nutrition units and complete editing", () => {
  it("converts supported units and refuses invented conversions", () => {
    expect(toServings(rice,150,"g")).toBe(1.5);
    expect(toServings(milk,250,"ml")).toBe(2.5);
    expect(toServings(milk,250,"g")).toBeNaN();
    const plate={...rice,servingSize:1,servingUnit:"portion" as const,servingLabel:"จาน",portionGrams:250};
    expect(toServings(plate,125,"g")).toBe(0.5);
    expect(availableUnits(plate)).toEqual(["portion","g"]);
    expect(basisLabel(plate)).toBe("1 จาน");
    expect(consumedLabel(rice,1.5)).toBe("150 กรัม");
    expect(toServings(rice,0,"g")).toBeNaN();
    expect(basisLabel({...rice,servingSize:undefined,servingUnit:undefined,servingLabel:undefined})).toContain("ไม่ระบุขนาด");
  });
  it("logs 150g using a per-100g catalog", async () => {
    const save=vi.fn().mockResolvedValue(undefined);
    render(<FoodLogger foods={[rice]} onAddLog={save} isAuthenticated />);
    fireEvent.click(screen.getByRole("button",{name:/ข้าว/}));
    change("จำนวน (หน่วย)","150");
    expect(screen.getByText(/รวม 195 kcal/)).toBeTruthy();
    click("บันทึกอาหาร");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({servings:1.5,quantity:150,quantityUnit:"g"});
  });
  it("creates a personal food and selects it for logging", async () => {
    const create=vi.fn().mockResolvedValue(milk), save=vi.fn().mockResolvedValue(undefined);
    render(<FoodLogger foods={[rice]} onAddLog={save} onCreateCustomFood={create} customFoods={[milk]} isAuthenticated />);
    fireEvent.click(screen.getByRole("button",{name:/อาหารของฉัน/}));
    change("ชื่ออาหาร","นมของฉัน");change("หมวดหมู่","drink");change("หน่วยอ้างอิง","ml");change("พลังงาน (kcal)","60");
    click("บันทึกอาหารส่วนตัว");
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({source:"custom",servingSize:100,servingUnit:"ml",category:"drink"});
    await screen.findByLabelText("จำนวน (หน่วย)");change("จำนวน (หน่วย)","250");click("บันทึกอาหาร");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({food:{customId:"private-1",source:"custom"},servings:2.5});
  });
  it("reuses personal food and converts known portion weight", () => {
    const plate={...milk,servingSize:1,servingUnit:"portion" as const,servingLabel:"แก้ว",portionGrams:200};
    render(<FoodLogger foods={[rice]} customFoods={[plate]} onAddLog={vi.fn()} isAuthenticated={false} />);
    fireEvent.click(screen.getByRole("button",{name:/อาหารของฉัน/}));
    expect(screen.getByText(/โหมดผู้เยี่ยมชม:/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region",{name:"รายการอาหารส่วนตัว"})).getByRole("button"));
    change("จำนวน (หน่วย)","0.5");
    change("หน่วยปริมาณ","g");
    expect((screen.getByLabelText("จำนวน (หน่วย)") as HTMLInputElement).value).toBe("100");
    click("ลดจำนวนครึ่งหน่วย");
    expect((screen.getByLabelText("จำนวน (หน่วย)") as HTMLInputElement).value).toBe("99.5");
  });
  it("edits date meal and quantity preserving historical food", async () => {
    const save=vi.fn().mockResolvedValue(undefined);
    render(<FoodLogEditor log={log} customFoods={[]} onSave={save} onCancel={vi.fn()} />);
    change("วันที่รับประทาน","2026-01-02");change("มื้ออาหาร","dinner");change("จำนวน (หน่วย)","200");click("บันทึกการแก้ไข");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({id:"log-1",mealType:"dinner",servings:2,replaceFood:false});
    expect(save.mock.calls[0][0].loggedAt.getDate()).toBe(2);
  });
  it("replaces food through catalog search", async () => {
    const save=vi.fn().mockResolvedValue(undefined);
    render(<FoodLogEditor log={{...log,food:milk}} customFoods={[]} onSave={save} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("เปลี่ยนอาหาร / แก้ชื่อและค่าโภชนาการ"));change("ค้นหาอาหารใหม่","ข้าว");
    fireEvent.click(await screen.findByRole("button",{name:/ข้าว ·/}));click("บันทึกการแก้ไข");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({food:{id:1},replaceFood:true,quantity:100,quantityUnit:"g"});
  });
  it("corrects name and nutrition only for this log", async () => {
    const save=vi.fn().mockResolvedValue(undefined);
    render(<FoodLogEditor log={log} customFoods={[]} onSave={save} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("เปลี่ยนอาหาร / แก้ชื่อและค่าโภชนาการ"));click("กรอกหรือแก้ข้อมูลเฉพาะรายการนี้");
    change("ชื่ออาหาร","ข้าวแก้ไข");change("พลังงาน (kcal)","140");click("ใช้ข้อมูลนี้กับรายการ");
    await waitFor(() => expect(screen.queryByLabelText("ชื่ออาหาร")).toBeNull());click("บันทึกการแก้ไข");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({food:{id:0,source:"custom",nameTh:"ข้าวแก้ไข",calories:140},replaceFood:true});
  });
  it("shows save failure and allows cancel", async () => {
    const cancel=vi.fn(),save=vi.fn().mockRejectedValue(new Error("บันทึกไม่สำเร็จ"));
    render(<FoodLogEditor log={log} customFoods={[milk]} onSave={save} onCancel={cancel} />);
    fireEvent.click(screen.getByText("เปลี่ยนอาหาร / แก้ชื่อและค่าโภชนาการ"));change("เลือกอาหารส่วนตัว","private-1");click("บันทึกการแก้ไข");
    expect((await screen.findByRole("alert")).textContent).toContain("บันทึกไม่สำเร็จ");click("ยกเลิก");expect(cancel).toHaveBeenCalledOnce();
  });
  it("validates custom input and surfaces errors", async () => {
    const save=vi.fn().mockRejectedValue(new Error("เชื่อมต่อไม่ได้"));
    render(<CustomFoodForm onSave={save} />);
    change("ชื่ออาหาร","   ");click("บันทึกอาหารส่วนตัว");expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("กรุณาตรวจสอบ");
    change("ชื่ออาหาร","ซุป");change("หน่วยอ้างอิง","portion");change("ชื่อหน่วย","ถ้วย");change("กรัมต่อ 1 หน่วย (ถ้าทราบ)","250");
    change("ค่าบนฉลากต่อจำนวน","2");click("บันทึกอาหารส่วนตัว");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("เชื่อมต่อไม่ได้"));
  });
  it("opens history editor and follows changed date", async () => {
    const save=vi.fn().mockResolvedValue(undefined);
    render(<History logs={[log]} onRemoveLog={vi.fn()} onUpdateServings={vi.fn()} onUpdateLog={save} />);
    change("วันที่บันทึก","2026-01-01");click("แก้ไข ข้าว");change("วันที่รับประทาน","2026-01-02");click("บันทึกการแก้ไข");
    await waitFor(() => expect(screen.queryByRole("region",{name:"แก้ไขรายการอาหาร"})).toBeNull());
    expect((screen.getByLabelText("วันที่บันทึก") as HTMLInputElement).value).toBe("2026-01-02");
  });
});
