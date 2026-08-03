import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { SalaryError } from "./salary.api";
import {
  getSalaryRecapEmployeePublication,
} from "./salary.publication.service";
import type { SalaryScope } from "./salary.service";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_CONTEXT = "nextgen:salary-publication-share:v1";

type SharePayload = {
  closingId: string;
  closingEmployeeId: string;
  tenantId: string;
  outletId: string;
  issuedAt: number;
  expiresAt: number;
};

type ShareOptions = {
  now?: Date;
  ttlSeconds?: number;
  secret?: string;
};

function shareKey(secret = process.env.INTEGRATION_ENCRYPTION_KEY) {
  if (!secret) throw new SalaryError("SALARY_SHARE_NOT_CONFIGURED", 503);
  const decoded = Buffer.from(secret, "base64");
  if (decoded.length !== 32) {
    throw new SalaryError("SALARY_SHARE_NOT_CONFIGURED", 503);
  }
  return createHash("sha256")
    .update(decoded)
    .update(TOKEN_CONTEXT)
    .digest();
}

export function createSalaryPublicationShareToken(
  input: Omit<SharePayload, "issuedAt" | "expiresAt">,
  options: ShareOptions = {},
) {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = options.ttlSeconds ?? TOKEN_TTL_SECONDS;
  const payload: SharePayload = {
    ...input,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", shareKey(options.secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_VERSION));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function verifySalaryPublicationShareToken(
  token: string,
  options: Pick<ShareOptions, "now" | "secret"> = {},
) {
  try {
    const [version, ivValue, encryptedValue, tagValue, extra] = token.split(".");
    if (
      version !== TOKEN_VERSION ||
      !ivValue ||
      !encryptedValue ||
      !tagValue ||
      extra
    ) {
      throw new Error("invalid token format");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      shareKey(options.secret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(TOKEN_VERSION));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(decrypted) as SharePayload;
    if (
      !payload.closingId ||
      !payload.closingEmployeeId ||
      !payload.tenantId ||
      !payload.outletId ||
      !Number.isInteger(payload.expiresAt)
    ) {
      throw new Error("invalid token payload");
    }
    const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
    if (payload.expiresAt <= now) {
      throw new SalaryError("SALARY_SHARE_EXPIRED", 410);
    }
    return payload;
  } catch (error) {
    if (error instanceof SalaryError) throw error;
    throw new SalaryError("SALARY_SHARE_INVALID", 404);
  }
}

function validatedOrigin(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("invalid public origin");
    }
    if (production && url.protocol !== "https:") {
      throw new Error("production share links require https");
    }
    return url.origin;
  } catch {
    throw new SalaryError("SALARY_SHARE_BASE_URL_INVALID", 503);
  }
}

export function resolveSalaryPublicBaseUrl(
  requestUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configured = environment.SALARY_PUBLIC_BASE_URL?.trim() ||
    environment.NEXT_PUBLIC_APP_URL?.trim() ||
    environment.APP_URL?.trim();
  const railwayDomain = environment.RAILWAY_PUBLIC_DOMAIN?.trim();
  const candidate = configured ||
    (railwayDomain ? `https://${railwayDomain}` : new URL(requestUrl).origin);
  return validatedOrigin(candidate, environment.NODE_ENV === "production");
}

export function formatSalaryWhatsappPeriod(start: string, end: string) {
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00.000Z`);
  const month = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  if (
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth()
  ) {
    return month.format(startDate);
  }
  const fullDate = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${fullDate.format(startDate)} - ${fullDate.format(endDate)}`;
}

export function buildSalaryWhatsappMessage(input: {
  employeeName: string;
  period: string;
  publicUrl: string;
}) {
  return [
    `Halo Bpk/Ibu ${input.employeeName},`,
    "",
    `Berikut kami sampaikan Slip Gaji periode ${input.period}.`,
    "",
    "Silakan unduh melalui tautan berikut:",
    "",
    input.publicUrl,
    "",
    "Terima kasih.",
  ].join("\n");
}

export async function createSalaryPublicationShare(input: {
  scope: SalaryScope;
  closingId: string;
  closingEmployeeId: string;
  requestUrl: string;
}, options: ShareOptions & { environment?: NodeJS.ProcessEnv } = {}) {
  const publication = await getSalaryRecapEmployeePublication(
    input.scope,
    input.closingId,
    input.closingEmployeeId,
  );
  const token = createSalaryPublicationShareToken({
    closingId: input.closingId,
    closingEmployeeId: input.closingEmployeeId,
    tenantId: input.scope.tenantId,
    outletId: input.scope.outletId,
  }, options);
  const baseUrl = resolveSalaryPublicBaseUrl(
    input.requestUrl,
    options.environment,
  );
  return {
    publicUrl: new URL(`/salary-card/share/${token}`, baseUrl).toString(),
    expiresAt: new Date(
      (Math.floor((options.now ?? new Date()).getTime() / 1000) +
        (options.ttlSeconds ?? TOKEN_TTL_SECONDS)) * 1000,
    ),
    message: buildSalaryWhatsappMessage({
      employeeName: publication.employee.name,
      period: formatSalaryWhatsappPeriod(
        publication.closing.periodStart.toISOString(),
        publication.closing.periodEnd.toISOString(),
      ),
      publicUrl: new URL(`/salary-card/share/${token}`, baseUrl).toString(),
    }),
  };
}

const decimalString = (value: { toString(): string }) => value.toString();

export async function getPublicSalaryCardByToken(
  token: string,
  options: Pick<ShareOptions, "now" | "secret"> = {},
) {
  const payload = verifySalaryPublicationShareToken(token, options);
  const publication = await getSalaryRecapEmployeePublication({
    tenantId: payload.tenantId,
    outletId: payload.outletId,
  }, payload.closingId, payload.closingEmployeeId);
  return {
    publishedAt: new Date(payload.issuedAt * 1000).toISOString(),
    closing: {
      closingNumber: publication.closing.closingNumber,
      periodStart: publication.closing.periodStart.toISOString(),
      periodEnd: publication.closing.periodEnd.toISOString(),
      processedAt: publication.closing.processedAt?.toISOString() ?? null,
    },
    identity: { outletCode: publication.identity.outletCode },
    employee: {
      name: publication.employee.name,
      division: publication.employee.division,
      workDayCount: publication.employee.workDayCount,
    },
    components: publication.components.map((row) => ({
      componentName: row.componentName,
      amount: decimalString(row.amount),
    })),
    additions: publication.additions.map((row) => ({
      category: row.category,
      reason: row.reason,
      amount: decimalString(row.amount),
    })),
    deductions: publication.deductions.map((row) => ({
      category: row.category,
      reason: row.reason,
      amount: decimalString(row.amount),
    })),
    kasbonAllocations: publication.kasbonAllocations.map((row) => ({
      amount: decimalString(row.amount),
      kasbonSnapshot: {
        description: row.kasbonSnapshot?.description ?? "Kasbon",
      },
    })),
    totals: {
      systemIncome: decimalString(publication.totals.systemIncome),
      addition: decimalString(publication.totals.addition),
      manualDeduction: decimalString(publication.totals.manualDeduction),
      kasbon: decimalString(publication.totals.kasbon),
      totalIncome: decimalString(publication.totals.totalIncome),
      totalDeduction: decimalString(publication.totals.totalDeduction),
      netSalary: decimalString(publication.totals.netSalary),
    },
  };
}

export const SALARY_PUBLICATION_SHARE_TTL_DAYS = 30;
