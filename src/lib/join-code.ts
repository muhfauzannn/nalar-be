// No I, L, O, 0 or 1: codes are read aloud and typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

export function generateJoinCode(): string {
  // Rejection sampling keeps every symbol equally likely (256 % 31 != 0).
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";
  while (code.length < JOIN_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < JOIN_CODE_LENGTH) {
        code += ALPHABET.charAt(byte % ALPHABET.length);
      }
    }
  }
  return code;
}

// Accepts what people actually paste: lower case, spaces, "ABCD-EFGH".
// Returns null when the input cannot possibly be a code.
export function normalizeJoinCode(raw: string): string | null {
  const code = raw.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{4,32}$/.test(code) ? code : null;
}
