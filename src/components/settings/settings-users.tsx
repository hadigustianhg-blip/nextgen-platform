"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Pencil, Plus, Search, UserCheck, UserX, X } from "lucide-react";
import { buttonClass, inputClass, SettingsCard } from "./settings-shell";

type EmployeeOption = { id: string; name: string; division: string; whatsapp: string | null; status: string };
export type SettingsUserRow = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  lastLoginAt: string | null;
  outlet: { id: string; code: string; name: string } | null;
  roles: { role: { code: string; name: string } }[];
  teamMemberships: { id: string; salaryEmployeeId: string; effectiveFrom: string; salaryEmployee: EmployeeOption }[];
};

type UserType = "ADMIN_WEB" | "TEAM_PWA";
export type UserForm = {
  name: string;
  email: string;
  userType: UserType;
  roleCode: string;
  salaryEmployeeId: string;
  password: string;
  confirmPassword: string;
  status: "ACTIVE" | "SUSPENDED";
};

export type UserFormField = keyof UserForm | "outlet";
export type UserFormErrors = Partial<Record<UserFormField, string>>;

export function validateSettingsUserForm(form: UserForm, options: { isCreate: boolean; outletCode: string }): UserFormErrors {
  const errors: UserFormErrors = {};
  const name = form.name.trim();
  const email = form.email.trim();

  if (!name) errors.name = "Nama lengkap wajib diisi.";
  else if (name.length < 2) errors.name = "Nama lengkap minimal 2 karakter.";
  if (!email) errors.email = "Email / Username wajib diisi.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Gunakan format email yang valid.";
  if (!form.userType) errors.userType = "Tipe User wajib dipilih.";
  if (!form.status) errors.status = "Status wajib dipilih.";
  if (!options.outletCode.trim()) errors.outlet = "Outlet aktif tidak tersedia.";
  if (form.userType === "ADMIN_WEB" && !form.roleCode.trim()) errors.roleCode = "Role wajib dipilih.";
  if (form.userType === "TEAM_PWA" && !form.salaryEmployeeId.trim()) errors.salaryEmployeeId = "Team member wajib dipilih.";

  if (options.isCreate) {
    if (!form.password) errors.password = "Password wajib diisi.";
    else if (form.password.length < 10) errors.password = "Password minimal 10 karakter.";
    else if (form.password.length > 128) errors.password = "Password maksimal 128 karakter.";
    if (!form.confirmPassword) errors.confirmPassword = "Konfirmasi Password wajib diisi.";
    else if (form.password !== form.confirmPassword) errors.confirmPassword = "Konfirmasi password tidak sama.";
  }

  return errors;
}

const safeUserErrors: Record<string, string> = {
  VALIDATION_ERROR: "Periksa kembali data user yang wajib diisi.",
  DUPLICATE_VALUE: "Email / Username sudah digunakan.",
  EMPLOYEE_ALREADY_LINKED: "Team member sudah terhubung ke user lain.",
  SALARY_EMPLOYEE_NOT_AVAILABLE: "Team member tidak tersedia atau sudah tidak aktif.",
  ROLE_NOT_ALLOWED: "Role yang dipilih tidak diizinkan.",
  ROLE_NOT_FOUND: "Role yang dipilih tidak tersedia.",
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  FORBIDDEN: "Anda tidak memiliki izin untuk mengelola user.",
  OUTLET_REQUIRED: "Outlet aktif tidak ditemukan pada session.",
  CONCURRENT_UPDATE: "Data berubah saat disimpan. Silakan coba kembali.",
  SETTINGS_REQUEST_FAILED: "User gagal disimpan. Silakan coba kembali.",
};

export function settingsUserErrorMessage(code?: string) {
  return safeUserErrors[code ?? ""] ?? "User gagal disimpan. Silakan coba kembali.";
}

const adminRoles = ["OWNER", "ADMIN", "FINANCE", "HR", "QC", "OPERATIONAL", "VIEWER"];
const emptyForm: UserForm = { name: "", email: "", userType: "ADMIN_WEB", roleCode: "ADMIN", salaryEmployeeId: "", password: "", confirmPassword: "", status: "ACTIVE" };
const typeOf = (user: SettingsUserRow): UserType => user.roles.some(({ role }) => role.code === "TEAM") ? "TEAM_PWA" : "ADMIN_WEB";
const roleOf = (user: SettingsUserRow) => user.roles[0]?.role.code ?? "VIEWER";
type SettingsUserResponse = { data?: unknown; error?: { code?: string; fieldErrors?: Record<string, string[]> } };

async function settingsUserApi(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const text = await response.text();
  let body: SettingsUserResponse | null = null;
  try { body = text ? JSON.parse(text) as SettingsUserResponse : null; } catch { body = null; }
  if (!response.ok || !body) throw new Error(settingsUserErrorMessage(body?.error?.code));
  return body;
}

export function SettingsUsers({ data, outletCode, reload }: { data: SettingsUserRow[]; outletCode: string; reload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editing, setEditing] = useState<SettingsUserRow | "new" | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [passwordFor, setPasswordFor] = useState<SettingsUserRow | null>(null);
  const [statusFor, setStatusFor] = useState<SettingsUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<UserFormField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const summary = useMemo(() => ({
    total: data.length,
    owner: data.filter((user) => roleOf(user) === "OWNER").length,
    admin: data.filter((user) => roleOf(user) === "ADMIN").length,
    team: data.filter((user) => roleOf(user) === "TEAM").length,
  }), [data]);
  const filtered = useMemo(() => data.filter((user) => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return (!query || `${user.name} ${user.email}`.toLocaleLowerCase("id-ID").includes(query))
      && (typeFilter === "ALL" || typeOf(user) === typeFilter)
      && (roleFilter === "ALL" || roleOf(user) === roleFilter)
      && (statusFilter === "ALL" || user.status === statusFilter);
  }), [data, roleFilter, search, statusFilter, typeFilter]);

  async function loadEmployees(current?: SettingsUserRow) {
    const result = await settingsUserApi("/api/settings/users/available-employees");
    const available = result.data as EmployeeOption[];
    const linked = current?.teamMemberships[0]?.salaryEmployee;
    setEmployees(linked && !available.some((item) => item.id === linked.id) ? [linked, ...available] : available);
  }

  async function openCreate() {
    setError(""); setMessage(""); setForm(emptyForm); setTouched({}); setSubmitAttempted(false); setShowPassword(false); setShowConfirmPassword(false); setEditing("new");
    try { await loadEmployees(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat Team."); }
  }

  async function openEdit(user: SettingsUserRow) {
    const userType = typeOf(user);
    setError(""); setMessage(""); setTouched({}); setSubmitAttempted(false);
    setForm({ name: user.name, email: user.email, userType, roleCode: userType === "TEAM_PWA" ? "TEAM" : roleOf(user), salaryEmployeeId: user.teamMemberships[0]?.salaryEmployeeId ?? "", password: "", confirmPassword: "", status: user.status });
    setEditing(user);
    try { await loadEmployees(user); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat Team."); }
  }

  async function saveUser() {
    if (saving) return;
    setSubmitAttempted(true);
    if (!validUserForm) {
      setError("Lengkapi field wajib sebelum menyimpan user.");
      return;
    }
    setSaving(true); setError("");
    try {
      const isCreate = editing === "new";
      const payload = { ...form, roleCode: form.userType === "TEAM_PWA" ? "TEAM" : form.roleCode, salaryEmployeeId: form.userType === "TEAM_PWA" ? form.salaryEmployeeId : null };
      if (!isCreate) { delete (payload as Partial<UserForm>).password; delete (payload as Partial<UserForm>).confirmPassword; }
      await settingsUserApi(isCreate ? "/api/settings/users" : `/api/settings/users/${(editing as SettingsUserRow).id}`, { method: isCreate ? "POST" : "PATCH", body: JSON.stringify(payload) });
      setEditing(null); setTouched({}); setSubmitAttempted(false); setMessage(isCreate ? "User berhasil ditambahkan." : "User berhasil diperbarui."); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "User gagal disimpan."); } finally { setSaving(false); }
  }

  async function resetPassword() {
    if (!passwordFor) return;
    setSaving(true); setError("");
    try {
      await settingsUserApi(`/api/settings/users/${passwordFor.id}/reset-password`, { method: "POST", body: JSON.stringify({ password: form.password }) });
      setPasswordFor(null); setForm(emptyForm); setMessage("Password berhasil direset dan session lama dicabut.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password gagal direset."); } finally { setSaving(false); }
  }

  async function changeStatus() {
    if (!statusFor) return;
    setSaving(true); setError("");
    const activate = statusFor.status !== "ACTIVE";
    try {
      await settingsUserApi(`/api/settings/users/${statusFor.id}/${activate ? "activate" : "deactivate"}`, { method: "POST" });
      setStatusFor(null); setMessage(activate ? "User berhasil diaktifkan." : "User berhasil dinonaktifkan."); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Status user gagal diubah."); } finally { setSaving(false); }
  }

  const selectedEmployee = employees.find((item) => item.id === form.salaryEmployeeId);
  const formErrors = useMemo(() => validateSettingsUserForm(form, { isCreate: editing === "new", outletCode }), [editing, form, outletCode]);
  const validUserForm = Object.keys(formErrors).length === 0;
  const touch = (field: UserFormField) => setTouched((current) => ({ ...current, [field]: true }));
  const visibleError = (field: UserFormField) => field === "outlet" || touched[field] || submitAttempted ? formErrors[field] : undefined;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Total User', summary.total], ['Owner', summary.owner], ['Admin', summary.admin], ['Team', summary.team]].map(([label, value]) => <SettingsCard key={label} title={String(label)}><p className="text-3xl font-extrabold text-slate-950">{value}</p></SettingsCard>)}
    </div>
    <SettingsCard title="User & Hak Akses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input className={`${inputClass} pl-10`} placeholder="Cari user" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
        <button className={buttonClass} onClick={() => void openCreate()}><Plus size={17}/> Tambah User</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">Semua Tipe</option><option value="ADMIN_WEB">Admin</option><option value="TEAM_PWA">Team / Kurir PWA</option></select>
        <select className={inputClass} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">Semua Role</option>{[...adminRoles, "TEAM"].map((role) => <option key={role}>{role}</option>)}</select>
        <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Semua Status</option><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Nonaktif</option></select>
      </div>
      {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500">{["Nama", "Email / Username", "Tipe User", "Role", "Status", "Login Terakhir", "Aksi"].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead><tbody>{filtered.map((user) => <tr key={user.id} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-800">{user.name}</td><td className="px-3">{user.email}</td><td className="px-3">{typeOf(user) === "TEAM_PWA" ? "Team / Kurir PWA" : "Admin"}</td><td className="px-3"><Badge tone={roleOf(user) === "TEAM" ? "blue" : "slate"}>{roleOf(user)}</Badge></td><td className="px-3"><Badge tone={user.status === "ACTIVE" ? "green" : "red"}>{user.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</Badge></td><td className="px-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("id-ID") : "—"}</td><td className="whitespace-nowrap px-3"><button className="p-2 text-blue-700" title="Edit" onClick={() => void openEdit(user)}><Pencil size={16}/></button><button className="p-2 text-slate-600" title="Reset Password" onClick={() => { setPasswordFor(user); setForm(emptyForm); setError(""); }}><KeyRound size={16}/></button><button className={`p-2 ${user.status === "ACTIVE" ? "text-red-600" : "text-emerald-700"}`} title={user.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"} onClick={() => setStatusFor(user)}>{user.status === "ACTIVE" ? <UserX size={16}/> : <UserCheck size={16}/>}</button></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Tidak ada user yang sesuai filter.</p>}</div>
    </SettingsCard>

    {editing && <Modal title={editing === "new" ? "Tambah User" : "Edit User"} onClose={() => setEditing(null)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Lengkap" required error={visibleError("name")}>
          <input className={inputClass} value={form.name} aria-invalid={Boolean(visibleError("name"))} onBlur={() => touch("name")} onChange={(event) => setForm({ ...form, name: event.target.value })}/>
        </Field>
        <Field label="Email / Username" required error={visibleError("email")} helper="Gunakan alamat email yang valid.">
          <input type="email" className={inputClass} value={form.email} aria-invalid={Boolean(visibleError("email"))} onBlur={() => touch("email")} onChange={(event) => setForm({ ...form, email: event.target.value })}/>
        </Field>
        <Field label="Tipe User" required error={visibleError("userType")}>
          <select className={inputClass} value={form.userType} aria-invalid={Boolean(visibleError("userType"))} onBlur={() => touch("userType")} onChange={(event) => setForm({ ...form, userType: event.target.value as UserType, roleCode: event.target.value === "TEAM_PWA" ? "TEAM" : "ADMIN", salaryEmployeeId: "" })}><option value="ADMIN_WEB">Admin</option><option value="TEAM_PWA">Team / Kurir PWA</option></select>
        </Field>
        <Field label="Status" required error={visibleError("status")}>
          <select className={inputClass} value={form.status} aria-invalid={Boolean(visibleError("status"))} onBlur={() => touch("status")} onChange={(event) => setForm({ ...form, status: event.target.value as UserForm["status"] })}><option value="ACTIVE">Aktif</option><option value="SUSPENDED">Nonaktif</option></select>
        </Field>
        <Field label="Outlet" required error={visibleError("outlet")}>
          <input className={inputClass} value={outletCode || "Outlet session aktif"} aria-invalid={Boolean(visibleError("outlet"))} disabled/>
        </Field>
        {form.userType === "ADMIN_WEB" ? <Field label="Role" required error={visibleError("roleCode")}>
          <select className={inputClass} value={form.roleCode} aria-invalid={Boolean(visibleError("roleCode"))} onBlur={() => touch("roleCode")} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>{adminRoles.map((role) => <option key={role}>{role}</option>)}</select>
        </Field> : <>
          <Field label="Role" required><input className={inputClass} value="TEAM" disabled/></Field>
          <Field label="SalaryEmployee terkait" required error={visibleError("salaryEmployeeId")} helper="Pilih Team member aktif yang akan dihubungkan.">
            <select className={inputClass} value={form.salaryEmployeeId} aria-invalid={Boolean(visibleError("salaryEmployeeId"))} onBlur={() => touch("salaryEmployeeId")} onChange={(event) => setForm({ ...form, salaryEmployeeId: event.target.value })}><option value="">Pilih Team/Kurir aktif</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.division}</option>)}</select>
          </Field>
          <Field label="Nomor WhatsApp"><input className={inputClass} value={selectedEmployee?.whatsapp ?? "—"} disabled/></Field>
        </>}
        {editing === "new" && <>
          <Field label="Password" required error={visibleError("password")} helper="Minimal 10 karakter.">
            <div className="relative">
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" className={`${inputClass} pr-11`} value={form.password} aria-invalid={Boolean(visibleError("password"))} onBlur={() => touch("password")} onChange={(event) => setForm({ ...form, password: event.target.value })}/>
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}</button>
            </div>
          </Field>
          <Field label="Konfirmasi Password" required error={visibleError("confirmPassword")}>
            <div className="relative">
              <input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" className={`${inputClass} pr-11`} value={form.confirmPassword} aria-invalid={Boolean(visibleError("confirmPassword"))} onBlur={() => touch("confirmPassword")} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}/>
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={showConfirmPassword ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setShowConfirmPassword((visible) => !visible)}>{showConfirmPassword ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}</button>
            </div>
          </Field>
        </>}
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setEditing(null)}>Batal</button><button type="button" className={buttonClass} disabled={!validUserForm || saving} onClick={() => void saveUser()}>{saving ? "Menyimpan..." : "Simpan User"}</button></div>
    </Modal>}
    {passwordFor && <Modal title={`Reset Password — ${passwordFor.name}`} onClose={() => setPasswordFor(null)}><div className="space-y-3"><Field label="Password Baru"><input type="password" className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></Field><Field label="Konfirmasi Password"><input type="password" className={inputClass} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}/></Field><p className="text-xs text-slate-500">Minimal 10 karakter. Reset akan mencabut seluruh session lama.</p></div><div className="mt-5 flex justify-end gap-2"><button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setPasswordFor(null)}>Batal</button><button className={buttonClass} disabled={saving || form.password.length < 10 || form.password !== form.confirmPassword} onClick={() => void resetPassword()}>{saving ? "Mereset..." : "Reset Password"}</button></div></Modal>}
    {statusFor && <Modal title={statusFor.status === "ACTIVE" ? "Nonaktifkan User" : "Aktifkan User"} onClose={() => setStatusFor(null)}><p className="text-sm leading-6 text-slate-600">{statusFor.status === "ACTIVE" ? `Nonaktifkan ${statusFor.name}? Seluruh session aktif akan dicabut.` : `Aktifkan kembali ${statusFor.name}?`}</p><div className="mt-5 flex justify-end gap-2"><button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setStatusFor(null)}>Batal</button><button className={buttonClass} disabled={saving} onClick={() => void changeStatus()}>{saving ? "Memproses..." : "Konfirmasi"}</button></div></Modal>}
  </div>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "blue" | "slate" | "green" | "red" }) { const colors = { blue: "bg-blue-50 text-blue-700", slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700" }; return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[tone]}`}>{children}</span>; }
function Field({ label, children, error, helper, required = false }: { label: string; children: React.ReactNode; error?: string; helper?: string; required?: boolean }) { return <div className="text-sm font-medium text-slate-700"><span className="mb-1 block">{label}{required ? " *" : ""}</span>{children}{error ? <p className="mt-1 text-xs font-medium text-red-700" role="alert">{error}</p> : helper ? <p className="mt-1 text-xs font-normal text-slate-500">{helper}</p> : null}</div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true"><section className="my-6 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-950">{title}</h3><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Tutup"><X size={18}/></button></div>{children}</section></div>; }
