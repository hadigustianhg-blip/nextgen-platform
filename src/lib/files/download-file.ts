"use client";

export class DownloadFileError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function downloadFile(
  url: string,
  options: { expectedContentType?: string } = {},
) {
  const response = await fetch(url, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  const unexpectedContentType = options.expectedContentType &&
    !contentType.toLowerCase().includes(options.expectedContentType.toLowerCase());
  if (!response.ok || unexpectedContentType) {
    if (contentType.toLowerCase().includes("application/json")) {
      const payload = await response.json().catch(() => null);
      throw new DownloadFileError(
        payload?.code || payload?.error?.code || "DOWNLOAD_FAILED",
        payload?.message || payload?.error?.message || "File gagal diunduh.",
      );
    }
    throw new DownloadFileError("DOWNLOAD_FAILED", "DOWNLOAD_FAILED");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] || "export.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
