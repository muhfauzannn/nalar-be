export const MAX_PDF_BYTES = 20 * 1024 * 1024;
// Total of one account's uploaded PDFs across the courses they teach.
export const USER_PDF_BYTES_LIMIT = 500 * 1024 * 1024;

// The browser reports whatever type it likes, and a name is just text, so neither is
// trusted: a real PDF starts with this marker.
export function looksLikePdf(bytes: Uint8Array) {
  const marker = "%PDF-";
  return bytes.length > marker.length && marker.split("").every((char, i) => bytes[i] === char.charCodeAt(0));
}

// The name people see. It never touches the disk (storage uses a generated key), but
// it ends up in a response header and in the UI, so keep it a plain, short file name.
export function displayFileName(raw: string, fallback: string) {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.pdf$/i, "")
    .trim();
  const stem = (cleaned || fallback.replace(/\.pdf$/i, "").trim() || "Dokumen").slice(0, 120).trim();
  return `${stem}.pdf`;
}

// RFC 6266: an ASCII fallback plus the real name percent-encoded (RFC 5987), so a
// name with spaces, accents or quotes can neither break the header nor inject one.
export function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb * 10) / 10} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// What a client may know about a stored file: its name and size, never the storage key.
export function publicResource<T extends { fileName: string | null; fileSize: number | null }>({
  fileName,
  fileSize,
  ...rest
}: T) {
  return {
    ...rest,
    file: fileName !== null && fileSize !== null ? { name: fileName, size: fileSize } : null,
  };
}
