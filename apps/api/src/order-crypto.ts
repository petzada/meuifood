// Tokens e hashes do Pedido (Ticket 24a), só com WebCrypto:
// - token da página do Pedido = HMAC-SHA256(ORDER_TOKEN_SECRET, id) em base64url: o banco guarda
//   só o SHA-256 do token; o Painel remonta o link ("Avisar no WhatsApp") e o retry idempotente
//   devolve o mesmo token sem guardá-lo em claro;
// - token do "Sou eu" = 32 bytes aleatórios (uso único; o banco guarda o SHA-256);
// - IP da busca por telefone = SHA-256 do IP truncado (/24 no IPv4, /48 no IPv6) com sal do
//   servidor (PHONE_LOOKUP_IP_SALT); telefone no rate limit = HMAC com o mesmo sal. Nada em claro.
// - hash do corpo da criação (idempotência) = SHA-256 do JSON canônico (chaves ordenadas).
const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** HMAC-SHA256 em hex (código de login e chave do telefone do Ticket 13). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  return toHex((await hmac(secret, message)).buffer as ArrayBuffer);
}

/** Segredo obrigatório: ausente/curto = erro (nunca um padrão embutido no código). */
export function requireSecret(value: string | undefined, name: string): string {
  const secret = value?.trim();
  if (!secret || secret.length < 16) throw new Error(`${name} ausente`);
  return secret;
}

/** Token da página do Pedido, derivado do id (43 caracteres base64url). */
export async function orderAccessToken(secret: string, orderId: string): Promise<string> {
  return base64url(await hmac(secret, `order-access:${orderId}`));
}

/** Token aleatório opaco (43 caracteres base64url). */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Expande um IPv6 (com `::`) para 8 grupos; null se não for IPv6 válido. */
function expandIpv6(ip: string): string[] | null {
  const address = ip.split("%")[0] ?? "";
  if (!/^[0-9a-f:.]+$/iu.test(address)) return null;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) => (part ? part.split(":") : []);
  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  return groups.every((group) => /^[0-9a-f]{1,4}$/iu.test(group))
    ? groups.map((group) => group.toLowerCase().replace(/^0+(?=.)/u, ""))
    : null;
}

/** IP truncado: /24 no IPv4, /48 no IPv6; null para valor que não é IP. */
export function truncateIp(ip: string | null | undefined): string | null {
  const value = ip?.trim() ?? "";
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  }
  const v6 = expandIpv6(value);
  return v6 ? `${v6.slice(0, 3).join(":")}::` : null;
}

/** Hash do IP truncado com o sal do servidor (auditoria e rate limit da busca por telefone). */
export function ipHash(salt: string, ip: string | null | undefined): Promise<string> {
  return sha256Hex(`ip|${salt}|${truncateIp(ip) ?? "desconhecido"}`);
}

/** Chave do telefone no rate limit (HMAC com o sal; nunca o número em claro). */
export async function phoneRateKey(salt: string, phoneE164: string): Promise<string> {
  return base64url(await hmac(salt, `phone|${phoneE164}`));
}

/** JSON canônico: chaves de objeto ordenadas, `undefined` omitido (como no JSON.stringify). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
