import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./download-file";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadFile", () => {
  it("waits for the blob, triggers download, and revokes the object URL", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click, remove }),
      body: { appendChild },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("xlsx", {
      headers: {
        "content-disposition": 'attachment; filename="Rincian.xlsx"',
      },
    })));

    await downloadFile("/api/export");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("rejects without triggering a browser download when export fails", async () => {
    const click = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({ click }),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("failed", { status: 500 })));

    await expect(downloadFile("/api/export")).rejects.toThrow("DOWNLOAD_FAILED");
    expect(click).not.toHaveBeenCalled();
  });
});
