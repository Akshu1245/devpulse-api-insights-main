const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const secretDigest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", secretDigest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptKey(plainText: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    textEncoder.encode(plainText)
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptKey(cipherPayload: string, secret: string): Promise<string> {
  const [ivBase64, cipherBase64] = cipherPayload.split(".");
  if (!ivBase64 || !cipherBase64) {
    throw new Error("Invalid encrypted key payload");
  }

  const iv = new Uint8Array(base64ToBytes(ivBase64));
  const cipherBytes = new Uint8Array(base64ToBytes(cipherBase64));
  const aesKey = await deriveAesKey(secret);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    cipherBytes
  );

  return textDecoder.decode(decrypted);
}
