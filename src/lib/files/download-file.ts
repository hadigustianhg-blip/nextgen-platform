"use client";

export async function downloadFile(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("DOWNLOAD_FAILED");
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] || "export.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
