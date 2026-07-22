const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Short room code suitable for sharing (e.g. 7k9p). */
export function generateRoomCode(length = 5): string {
  let out = "";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function isValidRoomCode(code: string): boolean {
  return /^[a-z0-9]{4,8}$/i.test(code.trim());
}
