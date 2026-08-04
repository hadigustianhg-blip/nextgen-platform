import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberInput, targetKpiPayload } from "./settings-target-kpi";

describe("Settings Target & KPI UI", () => {
  it("renders NumberInput as an accessible native numeric control", () => {
    const markup = renderToStaticMarkup(createElement(NumberInput, {
      label: "Target SLA",
      value: "95",
      onChange: () => undefined,
      suffix: "%",
      min: 0,
      max: 100,
    }));
    expect(markup).toContain('type="number"');
    expect(markup).toContain('inputMode="decimal"');
    expect(markup).toContain("Target SLA");
    expect(markup).toContain("%");
  });

  it("contains the four requested cards and six NumberInput fields", async () => {
    const source = await readFile(new URL("./settings-target-kpi.tsx", import.meta.url), "utf8");
    for (const title of ["Monitoring", "SLA", "Pickup", "Inventory"]) {
      expect(source).toContain(`title="${title}"`);
    }
    for (const label of [
      "Achievement Delivery",
      "Pending Maksimal",
      "Target SLA",
      "Target Pickup Omset",
      "Target Berat Pickup",
      "Maksimal Waybill Stuck",
    ]) expect(source).toContain(`label="${label}"`);
    expect(source.match(/<NumberInput label=/g)).toHaveLength(6);
  });

  it("uses NEXTGEN tokens, 18px cards, soft shadows, and a responsive tablet grid", async () => {
    const source = await readFile(new URL("./settings-target-kpi.tsx", import.meta.url), "utf8");
    expect(source).toContain("rounded-[18px]");
    expect(source).toContain("shadow-[0_10px_30px_rgba(15,23,42,0.06)]");
    expect(source).toContain("bg-[var(--nextgen-card)]");
    expect(source).toContain("md:grid-cols-2");
  });

  it("loads and persists through the scoped API without local storage", async () => {
    const source = await readFile(new URL("./settings-target-kpi.tsx", import.meta.url), "utf8");
    expect(source).toContain("Simpan Perubahan");
    expect(source).toContain('fetch("/api/settings/target-kpi"');
    expect(source).toContain('method: "PUT"');
    expect(source).toContain("!dirty || !valid || saving");
    expect(source).not.toContain("localStorage");
  });

  it("normalizes empty controls to null without inventing business defaults", () => {
    expect(targetKpiPayload({
      achievementDeliveryTarget: "",
      pendingMaximum: "",
      slaTarget: "",
      pickupRevenueTarget: "",
      pickupWeightTarget: "",
      waybillStuckMaximum: "",
    })).toEqual({
      achievementDeliveryTarget: null,
      pendingMaximum: null,
      slaTarget: null,
      pickupRevenueTarget: null,
      pickupWeightTarget: null,
      waybillStuckMaximum: null,
    });
  });

  it("shows canonical, custom, and unset source badges with required helper copy", async () => {
    const source = await readFile(new URL("./settings-target-kpi.tsx", import.meta.url), "utf8");
    for (const label of ["Default Sistem", "Target Outlet", "Belum diatur"]) expect(source).toContain(label);
    for (const helper of [
      "Batas pending yang masih dapat diterima.",
      "Target omset pickup per hari.",
      "Target berat pickup per hari.",
      "Batas maksimal inventory stuck pada periode aktif.",
    ]) expect(source).toContain(helper);
  });

  it("uses the existing Settings authorization guard on the new page", async () => {
    const page = await readFile(new URL("../../app/(dashboard)/dashboard/settings/target-kpi/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("requireSession()");
    expect(page).toContain("canAccessSettings(session)");
    expect(page).toContain('redirect("/dashboard")');
  });
});
