export type Role = "admin" | "controller" | "wall";
export type AuthUser = { id: string; name: string; email: string; role: Role };
export const roles: Role[] = ["admin", "controller", "wall"];
export const roleNames: Record<Role, string> = { admin: "Admin", controller: "Controller", wall: "Wall device" };
export function roleHome(role: Role) { return role === "admin" ? "/admin" : role === "controller" ? "/controller" : "/monitor"; }
export function canOpen(role: Role, page: "admin" | "controller" | "monitor") { return page === "monitor" || role === "admin" || page === "controller" && role === "controller"; }
export function canMutate(role: Role, action: unknown) { return role === "admin" || role === "controller" && action === "display"; }
export function safeReturnTo(value: string | null, role: Role) {
  if (!value || !/^\/(admin(?:\/[a-z]+)?|controller|monitor)$/.test(value)) return roleHome(role);
  return canOpen(role, value.startsWith("/admin") ? "admin" : value === "/controller" ? "controller" : "monitor") ? value : roleHome(role);
}
export function validPassword(value: unknown): value is string { return typeof value === "string" && value.length >= 12 && value.length <= 128; }
