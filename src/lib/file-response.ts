import type { Context } from "hono";

import { fileStorage } from "./file-storage";
import { contentDisposition } from "./pdf-upload";

// Streams a stored PDF. Callers have already decided the viewer may see it. It is
// served inline so it opens in the browser's viewer; `?download=1` forces a save.
// `nosniff` + an explicit type stop a browser from treating the bytes as anything else.
export async function fileResponse(context: Context, file: { key: string; name: string }) {
  const stored = await fileStorage.read(file.key);
  if (!stored) {
    return context.json({ error: "File tidak ditemukan di penyimpanan." }, 404);
  }
  const kind = context.req.query("download") === "1" ? "attachment" : "inline";
  return context.body(stored.stream, 200, {
    "Content-Type": "application/pdf",
    "Content-Length": String(stored.size),
    "Content-Disposition": contentDisposition(kind, file.name),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  });
}
