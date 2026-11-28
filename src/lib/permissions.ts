import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";

/** 全站能力清单，与后端 backend/app/permissions.py 一一对应。 */
export type Capability =
  | "dashboard.view"
  | "bookings.view"
  | "bookings.write"
  | "members.view"
  | "members.write"
  | "records.write"
  | "cards.write"
  | "revenue.write"
  | "catalog.view"
  | "catalog.write"
  | "products.view"
  | "products.write"
  | "finance.view"
  | "finance.write"
  | "reports.view"
  | "recycle.write"
  | "recycle.view"
  | "settings.view"
  | "settings.write";

export const CAPABILITIES: Capability[] = [
  "dashboard.view", "bookings.view", "bookings.write", "members.view", "members.write", "records.write",
  "cards.write", "revenue.write", "catalog.view", "catalog.write", "products.view", "products.write",
  "finance.view", "finance.write", "reports.view", "recycle.write", "recycle.view", "settings.view", "settings.write",
];

/** 本地兜底矩阵：服务端未返回 user.capabilities 时使用，正常情况以服务端为准。 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: [...CAPABILITIES],
  finance: ["dashboard.view", "bookings.view", "members.view", "catalog.view", "products.view", "products.write", "revenue.write", "finance.view", "finance.write", "reports.view", "recycle.write"],
  frontdesk: ["dashboard.view", "bookings.view", "bookings.write", "members.view", "members.write", "records.write", "cards.write", "revenue.write", "catalog.view", "catalog.write", "products.view", "reports.view", "recycle.write"],
  teacher: ["dashboard.view", "bookings.view", "members.view", "records.write", "catalog.view"],
  viewer: ["dashboard.view", "bookings.view", "members.view", "catalog.view", "products.view", "finance.view", "reports.view"],
};

/** 判断角色（或服务端下发的能力清单）是否具备某项能力。 */
export function hasCapability(role: Role | undefined, capability: Capability, granted?: string[] | null): boolean {
  if (Array.isArray(granted)) return granted.includes(capability);
  return (ROLE_CAPABILITIES[role ?? "viewer"] ?? []).includes(capability);
}

/** 具备其中任意一项能力即可通过，用于“查看流水或只做核销”这类组合入口。 */
export function hasAnyCapability(role: Role | undefined, capabilities: Capability | Capability[], granted?: string[] | null): boolean {
  const list = Array.isArray(capabilities) ? capabilities : [capabilities];
  return list.some((capability) => hasCapability(role, capability, granted));
}

/** 可回收资源 → 删除该类数据所需的能力，与后端 permissions.RESOURCE_CAPABILITIES 一致。 */
export const RESOURCE_CAPABILITIES: Record<string, Capability> = {
  users: "settings.write",
  members: "members.write",
  teachers: "catalog.write",
  rooms: "catalog.write",
  courses: "catalog.write",
  sessions: "bookings.write",
  products: "products.write",
  cards: "cards.write",
  bookings: "bookings.write",
  shares: "cards.write",
  vouchers: "cards.write",
  reminders: "members.write",
  "room-reservations": "bookings.write",
  records: "records.write",
  documents: "members.write",
  transactions: "finance.write",
  "api-keys": "settings.write",
};

/** 组件内判断当前登录人是否具备某项能力。 */
export function useCan(capability: Capability): boolean {
  const { user } = useAuth();
  return hasCapability(user?.role, capability, user?.capabilities);
}
