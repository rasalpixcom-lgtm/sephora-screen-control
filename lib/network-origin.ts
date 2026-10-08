export function isPrivateIPv4(hostname: string) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some(value => value > 255)) return false;
  return octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168;
}

export function validAuthOrigin(value: string, allowLanHttp = false) {
  const origin = new URL(value);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.origin !== value.replace(/\/$/, "")) return false;
  return origin.protocol === "https:" || ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || allowLanHttp && isPrivateIPv4(origin.hostname);
}
