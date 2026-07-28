import { NextResponse } from "next/server";
import { login } from "@/modules/auth/auth.service";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const input = loginSchema.safeParse(await request.json());
    if (!input.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Periksa kembali data login.", fieldErrors: input.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }

    const result = await login(input.data);
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Tenant, email, atau password tidak sesuai." } },
        { status: 401 },
      );
    }

    return NextResponse.json({ data: { redirectTo: "/dashboard" } });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi gangguan. Silakan coba kembali." } },
      { status: 500 },
    );
  }
}
