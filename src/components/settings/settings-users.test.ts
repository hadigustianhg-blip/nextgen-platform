import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsUserErrorMessage, type UserForm, validateSettingsUserForm } from "./settings-users";

const source = readFileSync(new URL("./settings-users.tsx", import.meta.url), "utf8");
const validPassword = "x".repeat(10);
const validAdmin: UserForm = {
  name: "Admin Outlet",
  email: "admin@example.com",
  userType: "ADMIN_WEB",
  roleCode: "ADMIN",
  salaryEmployeeId: "",
  password: validPassword,
  confirmPassword: validPassword,
  status: "ACTIVE",
};

describe("Settings Users create form", () => {
  it("keeps an empty Email / Username invalid and provides textual feedback", () => {
    const errors = validateSettingsUserForm({ ...validAdmin, email: "   " }, { isCreate: true, outletCode: "SUM001A" });
    expect(errors.email).toBe("Email / Username wajib diisi.");
    expect(source).toContain('onBlur={() => touch("email")}');
  });

  it("enables the save contract when every Admin field is valid", () => {
    expect(validateSettingsUserForm(validAdmin, { isCreate: true, outletCode: "SUM001A" })).toEqual({});
    expect(source).toContain("disabled={!validUserForm || saving}");
  });

  it("rejects a password confirmation that does not match", () => {
    const errors = validateSettingsUserForm({ ...validAdmin, confirmPassword: "y".repeat(10) }, { isCreate: true, outletCode: "SUM001A" });
    expect(errors.confirmPassword).toBe("Konfirmasi password tidak sama.");
  });

  it("uses independent Eye toggles for password and confirmation", () => {
    expect(source).toContain('type={showPassword ? "text" : "password"}');
    expect(source).toContain('type={showConfirmPassword ? "text" : "password"}');
    expect(source).toContain('aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}');
    expect(source).toContain('aria-label={showConfirmPassword ? "Sembunyikan password" : "Tampilkan password"}');
  });

  it("keeps both visibility toggles out of the submit flow", () => {
    const passwordToggle = source.match(/<button type="button"[^>]+aria-label=\{showPassword/g);
    const confirmToggle = source.match(/<button type="button"[^>]+aria-label=\{showConfirmPassword/g);
    expect(passwordToggle).toHaveLength(1);
    expect(confirmToggle).toHaveLength(1);
  });

  it("uses the existing create endpoint then closes and reloads after success", () => {
    expect(source).toContain('isCreate ? "/api/settings/users"');
    expect(source).toContain("setEditing(null);");
    expect(source).toContain("await reload();");
    expect(source).toContain('setMessage(isCreate ? "User berhasil ditambahkan."');
  });

  it("maps duplicate username and backend failures to safe messages", () => {
    expect(settingsUserErrorMessage("DUPLICATE_VALUE")).toBe("Email / Username sudah digunakan.");
    expect(settingsUserErrorMessage("UNKNOWN_DATABASE_ERROR")).toBe("User gagal disimpan. Silakan coba kembali.");
    expect(source).not.toContain("error.message");
  });

  it("prevents a second save while the first request is loading", () => {
    expect(source).toContain("if (saving) return;");
    expect(source).toContain("disabled={!validUserForm || saving}");
    expect(source).toContain('saving ? "Menyimpan..." : "Simpan User"');
  });

  it("does not require a Team member for an Admin user", () => {
    expect(validateSettingsUserForm(validAdmin, { isCreate: true, outletCode: "SUM001A" }).salaryEmployeeId).toBeUndefined();
  });

  it("requires a Team member for a Team PWA user", () => {
    const teamForm: UserForm = { ...validAdmin, userType: "TEAM_PWA", roleCode: "TEAM", salaryEmployeeId: "" };
    expect(validateSettingsUserForm(teamForm, { isCreate: true, outletCode: "SUM001A" }).salaryEmployeeId).toBe("Team member wajib dipilih.");
  });
});
