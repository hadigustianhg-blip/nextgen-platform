import { NextResponse } from "next/server";

export class SalaryError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const messages: Record<string, string> = {
  SALARY_PROFILE_NOT_FOUND: "Salary profile tidak ditemukan.",
  SALARY_PROFILE_CONFLICT: "Kode dan versi salary profile sudah digunakan.",
  SALARY_PROFILE_FINALIZED:
    "Salary profile sudah digunakan pada closing dan tidak dapat diubah. Buat profile versi baru.",
  SALARY_EMPLOYEE_NOT_FOUND: "Team tidak ditemukan.",
  SALARY_EMPLOYEE_ASSIGNMENT_CONFLICT:
    "Divisi team tidak sesuai dengan salary profile aktif. Tutup atau ganti assignment terlebih dahulu.",
  SALARY_ASSIGNMENT_OVERLAP: "Periode salary assignment bertumpang tindih.",
  SALARY_SCOPE_MISMATCH: "Data salary tidak tersedia pada outlet aktif.",
  SALARY_CLOSING_OVERLAP: "Periode salary closing bertumpang tindih.",
  SALARY_CLOSING_NOT_FOUND: "Salary closing tidak ditemukan.",
  SALARY_SAVE_FAILED: "Data salary gagal disimpan.",
};

export function salaryErrorResponse(error: unknown) {
  const known = error instanceof SalaryError
    ? error
    : new SalaryError("SALARY_SAVE_FAILED", 500);
  return NextResponse.json({
    error: {
      code: known.code,
      message: messages[known.code] ?? "Proses salary gagal.",
    },
  }, { status: known.status });
}
