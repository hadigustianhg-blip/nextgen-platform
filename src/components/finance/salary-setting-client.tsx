"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Check, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import {
  AppCard,
  FilterCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

const divisions = [
  ["ADMIN", "Admin"],
  ["ADMIN_OPS", "Admin Ops"],
  ["SALES", "Sales"],
  ["THREE_WHEEL_DRIVER", "Driver Roda Tiga"],
  ["MOTORIST", "Motoris"],
  ["DRIVER", "Driver"],
] as const;
const divisionLabel = (value: string) =>
  divisions.find(([key]) => key === value)?.[1] ?? value;
const profileStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Aktif",
  INACTIVE: "Tidak Aktif",
  ARCHIVED: "Diarsipkan",
};

type Profile = {
  id: string;
  code: string;
  name: string;
  division: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  description?: string | null;
  setting?: Partial<Record<typeof numericFields[number][0], string | null>>;
};
type Employee = {
  id: string;
  name: string;
  division: string;
  whatsapp: string | null;
  status: string;
  assignments: Array<{
    effectiveFrom: string;
    effectiveTo: string | null;
    salaryProfile: Profile;
  }>;
};

type DeleteTarget = {
  kind: "team" | "profile";
  id: string;
  name: string;
};

const numericFields = [
  ["basicDailySalary", "Basic Salary Harian"],
  ["overtimeRate", "Lembur"],
  ["fixedAllowance", "Tunjangan Tetap"],
  ["deliveryPerKgAmount", "Delivery Per Kg"],
  ["deliveryPerKgMinWeight", "Minimal Berat Per Kg"],
  ["deliveryPerKgMaxWeight", "Maksimal Berat Per Kg"],
  ["deliveryPerWaybillAmount", "Delivery Per Waybill"],
  ["deliveryPerWaybillMinWeight", "Minimal Berat Per Waybill"],
  ["deliveryPerWaybillMaxWeight", "Maksimal Berat Per Waybill"],
  ["pickupRegularRevenuePercentage", "Pickup Reguler Omset (%)"],
  ["pickupRegularPerWaybillAmount", "Pickup Reguler Per Waybill"],
  ["pickupMarketplacePerWaybillAmount", "Pickup Marketplace Per Waybill"],
  ["dailyFuelMinDeliveryWaybill", "Minimal Waybill BBM"],
  ["dailyFuelAmount", "Nominal BBM"],
  ["dailyExtraMinDeliveryWaybill", "Minimal Waybill Extra Delivery"],
  ["dailyExtraAmount", "Nominal Extra Delivery"],
] as const;

type NumericKey = typeof numericFields[number][0];
type ProfileForm = {
  code: string;
  name: string;
  division: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string;
  version: string;
} & Record<NumericKey, string>;

const emptyProfile = (): ProfileForm => ({
  code: "",
  name: "",
  division: "ADMIN",
  description: "",
  effectiveFrom: jakartaOperationalDate(),
  effectiveTo: "",
  version: "1",
  ...Object.fromEntries(numericFields.map(([key]) => [key, ""])),
} as ProfileForm);

function NumericField({
  field, label, form, setForm, errors, unit, helper,
}: {
  field: NumericKey;
  label: string;
  form: ProfileForm;
  setForm: Dispatch<SetStateAction<ProfileForm>>;
  errors: Record<string, string[]>;
  unit?: string;
  helper?: string;
}) {
  return <label className="block text-sm font-semibold text-slate-700">
    {label}
    <div className="relative mt-1">
      {unit && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">{unit}</span>}
      <input type="number" min="0" step="any" value={form[field]}
        onChange={(event) => setForm((current) => ({
          ...current, [field]: event.target.value,
        }))}
        className={`${nextgenControlClass} ${unit ? "pl-10" : ""}`}/>
    </div>
    {helper && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{helper}</span>}
    {errors[field]?.[0] && <span className="mt-1 block text-xs font-normal text-rose-700">{errors[field][0]}</span>}
  </label>;
}

export function SalarySettingClient({ canManage }: { canManage: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [team, setTeam] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileForm, setProfileForm] = useState(emptyProfile());
  const [profileSaving, setProfileSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [activationTarget, setActivationTarget] = useState<Profile | null>(null);
  const [activationSaving, setActivationSaving] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDivision, setTeamDivision] = useState("ADMIN");
  const [teamWhatsapp, setTeamWhatsapp] = useState("");
  const [teamStatus, setTeamStatus] = useState("ACTIVE");
  const [editingTeam, setEditingTeam] = useState<Employee | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDivision, setEditTeamDivision] = useState("ADMIN");
  const [editTeamWhatsapp, setEditTeamWhatsapp] = useState("");
  const [editTeamStatus, setEditTeamStatus] = useState("ACTIVE");
  const [teamSaving, setTeamSaving] = useState(false);
  const [assignmentEmployee, setAssignmentEmployee] = useState<Employee | null>(null);
  const [assignmentProfileId, setAssignmentProfileId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(jakartaOperationalDate());
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ search, division, status });
      const [profileResponse, teamResponse] = await Promise.all([
        fetch("/api/finance/salary/profiles", { cache: "no-store" }),
        fetch(`/api/finance/salary/team?${query}`, { cache: "no-store" }),
      ]);
      if (!profileResponse.ok || !teamResponse.ok) throw new Error();
      setProfiles((await profileResponse.json()).data);
      setTeam((await teamResponse.json()).data);
    } catch {
      setError("Data Salary Setting gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadData());
  // Initial load only; filters are applied through the explicit search action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (profileSaving) return;
    setProfileSaving(true);
    setFieldErrors({});
    setError("");
    const numeric = Object.fromEntries(numericFields.map(([key]) => [
      key,
      profileForm[key] === "" ? null : Number(profileForm[key]),
    ]));
    const isEditing = Boolean(editingProfileId);
    try {
      const response = await fetch(
        editingProfileId
          ? `/api/finance/salary/profiles/${editingProfileId}`
          : "/api/finance/salary/profiles",
        {
        method: editingProfileId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: profileForm.code,
          name: profileForm.name,
          division: profileForm.division,
          description: profileForm.description || null,
          effectiveFrom: profileForm.effectiveFrom,
          effectiveTo: profileForm.effectiveTo || null,
          version: Number(profileForm.version),
          ...numeric,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFieldErrors(result.error?.fields ?? {});
        throw new Error(result.error?.message || "Salary profile gagal disimpan.");
      }
      setProfileOpen(false);
      setEditingProfileId("");
      setProfileForm(emptyProfile());
      setNotice(isEditing
        ? "Salary profile berhasil diperbarui."
        : "Salary profile berhasil disimpan.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Salary profile gagal disimpan.");
    } finally {
      setProfileSaving(false);
    }
  }

  function editProfile(profile: Profile) {
    setEditingProfileId(profile.id);
    setProfileForm({
      code: profile.code,
      name: profile.name,
      division: profile.division,
      description: profile.description || "",
      effectiveFrom: profile.effectiveFrom.slice(0, 10),
      effectiveTo: profile.effectiveTo?.slice(0, 10) || "",
      version: String(profile.version),
      ...Object.fromEntries(numericFields.map(([key]) => [
        key,
        profile.setting?.[key] == null ? "" : String(profile.setting[key]),
      ])),
    } as ProfileForm);
    setProfileOpen(true);
  }

  async function activateProfile() {
    if (!activationTarget || activationSaving) return;
    setActivationSaving(true);
    try {
      const response = await fetch(
        `/api/finance/salary/profiles/${activationTarget.id}/activate`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error();
      setActivationTarget(null);
      setNotice("Salary profile berhasil diaktifkan.");
      await loadData();
    } catch {
      setError("Salary profile gagal diaktifkan.");
    } finally {
      setActivationSaving(false);
    }
  }

  async function addTeam() {
    if (teamSaving) return;
    if (!teamName.trim()) {
      setError("Nama Team wajib diisi.");
      return;
    }
    setTeamSaving(true);
    try {
      const response = await fetch("/api/finance/salary/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: teamName,
          division: teamDivision,
          whatsapp: teamWhatsapp || null,
          status: teamStatus,
        }),
      });
      if (!response.ok) throw new Error();
      setTeamName("");
      setTeamWhatsapp("");
      setTeamStatus("ACTIVE");
      setNotice("Informasi team berhasil disimpan.");
      await loadData();
    } catch {
      setError("Informasi team gagal disimpan.");
    } finally {
      setTeamSaving(false);
    }
  }

  function openEditTeam(employee: Employee) {
    setEditingTeam(employee);
    setEditTeamName(employee.name);
    setEditTeamDivision(employee.division);
    setEditTeamWhatsapp(employee.whatsapp || "");
    setEditTeamStatus(employee.status);
    setError("");
  }

  async function saveTeamEdit() {
    if (!editingTeam || teamSaving) return;
    if (!editTeamName.trim()) {
      setError("Nama Team wajib diisi.");
      return;
    }
    setTeamSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/salary/team/${editingTeam.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editTeamName,
          division: editTeamDivision,
          whatsapp: editTeamWhatsapp || null,
          status: editTeamStatus,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Informasi team gagal diperbarui.");
      }
      setEditingTeam(null);
      setNotice("Informasi team berhasil diperbarui.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Informasi team gagal diperbarui.");
    } finally {
      setTeamSaving(false);
    }
  }

  async function saveAssignment() {
    if (!assignmentEmployee || assignmentSaving) return;
    if (!assignmentProfileId) {
      setError("Salary Profile wajib dipilih.");
      return;
    }
    setAssignmentSaving(true);
    try {
      const response = await fetch(
        `/api/finance/salary/team/${assignmentEmployee.id}/assignment`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            salaryProfileId: assignmentProfileId,
            effectiveFrom: assignmentDate,
            effectiveTo: null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);
      setAssignmentEmployee(null);
      setAssignmentProfileId("");
      setNotice("Salary Profile team berhasil ditetapkan.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error && cause.message
        ? cause.message
        : "Assignment salary gagal disimpan.");
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function removeSettingData() {
    if (!deleteTarget || deleteSaving) return;
    setDeleteSaving(true);
    setError("");
    try {
      const endpoint = deleteTarget.kind === "team"
        ? `/api/finance/salary/team/${deleteTarget.id}`
        : `/api/finance/salary/profiles/${deleteTarget.id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Data Salary Setting gagal dihapus.");
      }
      setDeleteTarget(null);
      setNotice(result.data?.message || "Data Salary Setting berhasil dihapus.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Data Salary Setting gagal dihapus.");
    } finally {
      setDeleteSaving(false);
    }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Setting"
      description="Kelola informasi team, salary profile, dan komponen salary manual."/>
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      Perubahan team atau Salary Profile hanya berlaku untuk Salary Closing baru.
      Closing yang sudah di-generate tetap menggunakan snapshot lama. Untuk menerapkan
      perubahan, Void closing lama lalu buat dan Generate closing baru.
    </div>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

    <SectionCard title="Informasi Team">
      <FilterCard>
        <div className="grid gap-3 md:grid-cols-4">
          <input aria-label="Search nama team" value={search}
            placeholder="Cari nama team" onChange={(event) => setSearch(event.target.value)}
            className={nextgenControlClass}/>
          <select aria-label="Filter divisi" value={division}
            onChange={(event) => setDivision(event.target.value)}
            className={nextgenControlClass}>
            <option value="">Semua divisi</option>
            {divisions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select aria-label="Filter status" value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={nextgenControlClass}>
            <option value="">Semua status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Tidak Aktif</option>
          </select>
          <button type="button" disabled={loading} onClick={() => void loadData()}
            className={nextgenNeutralButtonClass}>
            {loading ? <LoaderCircle className="animate-spin" size={17}/> : <Search size={17}/>}
            Cari
          </button>
        </div>
      </FilterCard>
      {canManage && <AppCard className="mt-4 grid gap-3 p-4 md:grid-cols-5">
        <input aria-label="Nama Team" value={teamName} placeholder="Nama Team"
          onChange={(event) => setTeamName(event.target.value)}
          className={nextgenControlClass}/>
        <select aria-label="Divisi Team" value={teamDivision}
          onChange={(event) => setTeamDivision(event.target.value)}
          className={nextgenControlClass}>
          {divisions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input aria-label="Nomor WhatsApp Team" value={teamWhatsapp}
          placeholder="Nomor WhatsApp" onChange={(event) => setTeamWhatsapp(event.target.value)}
          className={nextgenControlClass}/>
        <select aria-label="Status Team" value={teamStatus}
          onChange={(event) => setTeamStatus(event.target.value)}
          className={nextgenControlClass}>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Tidak Aktif</option>
        </select>
        <button type="button" disabled={teamSaving} onClick={() => void addTeam()}
          className={nextgenButtonClass}>
          {teamSaving ? <LoaderCircle className="animate-spin" size={17}/> : <Plus size={17}/>}
          {teamSaving ? "Menyimpan..." : "Tambah Team"}
        </button>
      </AppCard>}
      <TableCard className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              {["Nama Team", "Divisi", "Nomor WhatsApp", "Status", "Salary Profile", "Aksi"]
                .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y">{team.map((employee) => {
              const assignment = employee.assignments[0];
              return <tr key={employee.id}>
                <td className="px-3 py-3 font-semibold">{employee.name}</td>
                <td className="px-3 py-3">{divisionLabel(employee.division)}</td>
                <td className="px-3 py-3">{employee.whatsapp || "—"}</td>
                <td className="px-3 py-3">{employee.status === "ACTIVE" ? "Aktif" : "Tidak Aktif"}</td>
                <td className="px-3 py-3">{assignment?.salaryProfile.name || "Belum diassign"}</td>
                <td className="px-3 py-3">{canManage && <div className="flex gap-2">
                  <button type="button" onClick={() => openEditTeam(employee)}
                    className={nextgenNeutralButtonClass}>Edit</button>
                  <button type="button" onClick={() => {
                    setAssignmentEmployee(employee);
                    setAssignmentProfileId("");
                  }} className={nextgenNeutralButtonClass}>Assign Profile</button>
                  <button type="button" disabled={deleteSaving}
                    onClick={() => setDeleteTarget({
                      kind: "team", id: employee.id, name: employee.name,
                    })} className={nextgenNeutralButtonClass}>
                    <Trash2 size={16}/>Hapus
                  </button>
                </div>}</td>
              </tr>;
            })}</tbody>
          </table>
          {!loading && !team.length && <p className="p-8 text-center text-sm text-slate-500">Belum ada informasi team.</p>}
        </div>
      </TableCard>
    </SectionCard>

    <SectionCard title="Salary Profile" badge={canManage
      ? <button type="button" onClick={() => setProfileOpen(true)}
          className={nextgenButtonClass}><Plus size={17}/>Tambah Salary Profile</button>
      : undefined}>
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nama Profile", "Divisi", "Version", "Berlaku Mulai", "Berlaku Sampai", "Status", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{profiles.map((profile) => <tr key={profile.id}>
            <td className="px-3 py-3"><span className="font-semibold">{profile.name}</span>
              <span className="block text-xs text-slate-500">{profile.code}</span></td>
            <td className="px-3 py-3">{divisionLabel(profile.division)}</td>
            <td className="px-3 py-3">v{profile.version}</td>
            <td className="px-3 py-3">{profile.effectiveFrom.slice(0, 10)}</td>
            <td className="px-3 py-3">{profile.effectiveTo?.slice(0, 10) || "—"}</td>
            <td className="px-3 py-3">{profileStatusLabel[profile.status] ?? profile.status}</td>
            <td className="px-3 py-3">{canManage &&
              <div className="flex gap-2">
                <button type="button" onClick={() => editProfile(profile)}
                  className={nextgenNeutralButtonClass}>Edit</button>
                {profile.status === "DRAFT" && <button type="button"
                  onClick={() => setActivationTarget(profile)}
                  className={nextgenNeutralButtonClass}><Check size={16}/>Aktifkan</button>}
                <button type="button" disabled={deleteSaving}
                  onClick={() => setDeleteTarget({
                    kind: "profile", id: profile.id, name: profile.name,
                  })} className={nextgenNeutralButtonClass}>
                  <Trash2 size={16}/>Hapus
                </button>
              </div>}</td>
          </tr>)}</tbody>
        </table>
      </div></TableCard>
    </SectionCard>

    {profileOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3 sm:p-4">
      <ModalCard className="flex max-h-[92vh] max-w-[960px] flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b p-5">
          <div><p className="text-sm text-slate-500">Salary Setting</p>
            <h2 className="text-xl font-bold">
              {editingProfileId ? "Edit Salary Profile" : "Tambah Salary Profile"}
            </h2></div>
          <button type="button" disabled={profileSaving}
            onClick={() => {
              setProfileOpen(false);
              setEditingProfileId("");
              setProfileForm(emptyProfile());
            }}><X/></button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <AppCard className="p-4">
            <h3 className="mb-4 font-bold">Informasi Dasar</h3>
            <div className="grid gap-4 md:grid-cols-2">
            {[
              ["code", "Kode Profile", "text"],
              ["name", "Nama Profile", "text"],
            ].map(([key, label, type]) => <label key={key}
              className="text-sm font-semibold text-slate-700">{label}
              <input type={type} value={profileForm[key as keyof typeof profileForm]}
                onChange={(event) => setProfileForm((current) => ({
                  ...current, [key]: event.target.value,
                }))} className={`${nextgenControlClass} mt-1`}/>
              {fieldErrors[key]?.[0] && <span className="text-xs text-rose-700">{fieldErrors[key][0]}</span>}
            </label>)}
            <label className="text-sm font-semibold text-slate-700">Divisi
              <select value={profileForm.division}
                onChange={(event) => setProfileForm((current) => ({
                  ...current, division: event.target.value,
                }))} className={`${nextgenControlClass} mt-1`}>
                {divisions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Version
              <input type="number" min="1" value={profileForm.version}
                onChange={(event) => setProfileForm((current) => ({
                  ...current, version: event.target.value,
                }))} className={`${nextgenControlClass} mt-1`}/>
              {fieldErrors.version?.[0] && <span className="text-xs text-rose-700">{fieldErrors.version[0]}</span>}
            </label>
            {[
              ["effectiveFrom", "Berlaku Mulai"],
              ["effectiveTo", "Berlaku Sampai"],
            ].map(([key, label]) => <label key={key}
              className="text-sm font-semibold text-slate-700">{label}
              <input type="date" value={profileForm[key as "effectiveFrom" | "effectiveTo"]}
                onChange={(event) => setProfileForm((current) => ({
                  ...current, [key]: event.target.value,
                }))} className={`${nextgenControlClass} mt-1`}/>
              {fieldErrors[key]?.[0] && <span className="text-xs text-rose-700">{fieldErrors[key][0]}</span>}
            </label>)}
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Deskripsi
              <textarea value={profileForm.description}
                onChange={(event) => setProfileForm((current) => ({
                  ...current, description: event.target.value,
                }))} className={`${nextgenControlClass} mt-1`}/>
            </label>
            </div>
          </AppCard>
          <AppCard className="p-4">
            <h3 className="mb-4 font-bold">Salary Basic</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <NumericField field="basicDailySalary" label="Basic Salary Harian" unit="Rp"
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              <NumericField field="overtimeRate" label="Lembur" unit="Rp"
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              <NumericField field="fixedAllowance" label="Tunjangan Tetap" unit="Rp"
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
            </div>
          </AppCard>
          <AppCard className="space-y-5 p-4">
            <h3 className="font-bold">Insentif Delivery</h3>
            <div>
              <h4 className="mb-3 text-sm font-bold">Perhitungan Berdasarkan Berat</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <NumericField field="deliveryPerKgAmount" label="Nominal Per Kg" unit="Rp"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="deliveryPerKgMinWeight" label="Minimal Berat" unit="kg"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="deliveryPerKgMaxWeight" label="Maksimal Berat" unit="kg"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-bold">Perhitungan Berdasarkan Waybill</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <NumericField field="deliveryPerWaybillAmount" label="Nominal Per Waybill" unit="Rp"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="deliveryPerWaybillMinWeight" label="Minimal Berat" unit="kg"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="deliveryPerWaybillMaxWeight" label="Maksimal Berat" unit="kg"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              </div>
            </div>
          </AppCard>
          <AppCard className="p-4">
            <h3 className="mb-4 font-bold">Insentif Pickup</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <NumericField field="pickupRegularRevenuePercentage" label="Pickup Reguler Omset (%)"
                helper="Persentase dari Freight untuk settlement DFOD dan Tunai."
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              <NumericField field="pickupRegularPerWaybillAmount" label="Pickup Reguler Per Waybill" unit="Rp"
                helper="Nominal tetap per waybill reguler jika digunakan."
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              <NumericField field="pickupMarketplacePerWaybillAmount" label="Pickup Marketplace Per Waybill" unit="Rp"
                helper="Nominal tetap per waybill dengan settlement Bulanan."
                form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
            </div>
          </AppCard>
          <AppCard className="space-y-5 p-4">
            <h3 className="font-bold">Insentif Harian</h3>
            <div>
              <h4 className="mb-3 text-sm font-bold">Insentif BBM</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <NumericField field="dailyFuelMinDeliveryWaybill" label="Minimal Waybill BBM"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="dailyFuelAmount" label="Nominal BBM" unit="Rp"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-bold">Extra Delivery</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <NumericField field="dailyExtraMinDeliveryWaybill" label="Minimal Waybill Extra Delivery"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
                <NumericField field="dailyExtraAmount" label="Nominal Extra Delivery" unit="Rp"
                  form={profileForm} setForm={setProfileForm} errors={fieldErrors}/>
              </div>
            </div>
          </AppCard>
          <AppCard className="grid gap-4 bg-slate-50 p-4 md:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sumber Delivery</p>
              <p className="mt-1 font-bold">Dispatch</p>
              <p className="mt-2 text-sm">Hanya data dengan status &quot;Penerimaan Normal&quot; yang akan dihitung.</p>
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sumber Pickup</p>
              <p className="mt-1 font-bold">Pickup</p>
              <div className="mt-2 space-y-2 text-sm">
                <p><strong>Pickup Reguler</strong><br/>Settlement: DFOD dan Tunai<br/>Dasar omzet: Freight</p>
                <p><strong>Pickup Marketplace</strong><br/>Settlement: Bulanan<br/>Perhitungan: per waybill</p>
              </div>
            </div>
          </AppCard>
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t bg-white p-4">
          <button type="button" disabled={profileSaving}
            onClick={() => {
              setProfileOpen(false);
              setEditingProfileId("");
              setProfileForm(emptyProfile());
            }} className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={profileSaving}
            onClick={() => void saveProfile()} className={nextgenButtonClass}>
            {profileSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {profileSaving ? "Menyimpan..." : editingProfileId
              ? "Simpan Perubahan"
              : "Simpan Salary Profile"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {activationTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5"><h2 className="text-xl font-bold">Aktifkan Salary Profile</h2>
          <p className="mt-1 text-sm text-slate-500">{activationTarget.name} versi {activationTarget.version} akan diaktifkan.</p></div>
        <div className="flex justify-end gap-3 p-4">
          <button type="button" disabled={activationSaving}
            onClick={() => setActivationTarget(null)} className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={activationSaving}
            onClick={() => void activateProfile()} className={nextgenButtonClass}>
            {activationSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {activationSaving ? "Mengaktifkan..." : "Aktifkan"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {editingTeam && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm text-slate-500">Informasi Team</p>
            <h2 className="text-xl font-bold">Edit Team</h2>
          </div>
          <button type="button" disabled={teamSaving}
            aria-label="Tutup Edit Team" onClick={() => setEditingTeam(null)}><X/></button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Nama Team
            <input value={editTeamName}
              onChange={(event) => setEditTeamName(event.target.value)}
              className={`${nextgenControlClass} mt-1`}/>
          </label>
          <label className="text-sm font-semibold text-slate-700">Divisi
            <select value={editTeamDivision}
              onChange={(event) => setEditTeamDivision(event.target.value)}
              className={`${nextgenControlClass} mt-1`}>
              {divisions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Status
            <select value={editTeamStatus}
              onChange={(event) => setEditTeamStatus(event.target.value)}
              className={`${nextgenControlClass} mt-1`}>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Tidak Aktif</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Nomor WhatsApp
            <input value={editTeamWhatsapp}
              onChange={(event) => setEditTeamWhatsapp(event.target.value)}
              className={`${nextgenControlClass} mt-1`}/>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t p-4">
          <button type="button" disabled={teamSaving}
            onClick={() => setEditingTeam(null)}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={teamSaving}
            onClick={() => void saveTeamEdit()} className={nextgenButtonClass}>
            {teamSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {teamSaving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {assignmentEmployee && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5"><h2 className="text-xl font-bold">Assign Salary Profile</h2>
          <p className="text-sm text-slate-500">{assignmentEmployee.name}</p></div>
        <div className="space-y-4 p-5">
          <select aria-label="Salary Profile Assignment" value={assignmentProfileId}
            onChange={(event) => setAssignmentProfileId(event.target.value)}
            className={nextgenControlClass}>
            <option value="">Pilih Salary Profile</option>
            {profiles.filter((profile) => profile.status === "ACTIVE" &&
              profile.division === assignmentEmployee.division)
              .map((profile) => <option key={profile.id} value={profile.id}>
                {profile.name} · v{profile.version}
              </option>)}
          </select>
          <input aria-label="Tanggal Berlaku Assignment" type="date"
            value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value)}
            className={nextgenControlClass}/>
        </div>
        <div className="flex justify-end gap-3 border-t p-4">
          <button type="button" disabled={assignmentSaving}
            onClick={() => setAssignmentEmployee(null)} className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={assignmentSaving}
            onClick={() => void saveAssignment()} className={nextgenButtonClass}>
            {assignmentSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {assignmentSaving ? "Menyimpan..." : "Simpan Assignment"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5">
          <h2 className="text-xl font-bold">
            Hapus {deleteTarget.kind === "team" ? "Team" : "Salary Profile"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Hapus <strong>{deleteTarget.name}</strong>? Data yang sudah memiliki histori
            Salary akan dipertahankan dan hanya dinonaktifkan.
          </p>
        </div>
        <div className="flex justify-end gap-3 p-4">
          <button type="button" disabled={deleteSaving}
            onClick={() => setDeleteTarget(null)} className={nextgenNeutralButtonClass}>
            Batal
          </button>
          <button type="button" disabled={deleteSaving}
            onClick={() => void removeSettingData()} className={nextgenButtonClass}>
            {deleteSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {deleteSaving ? "Memproses..." : "Hapus"}
          </button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}
