// Shared, prisma-free client types for the Settings page. Roles and permissions
// are treated as opaque strings on the client so the bundle never imports the
// Prisma enum or rbac.ts; the server validates them on save.

export type RoleKey = string;
export type PermKey = string;

export interface PermGroup {
  page: string;
  label: string;
  readPermission?: PermKey;
  permissions: { key: PermKey; label: string }[];
}

export interface RoleOption {
  key: RoleKey;
  label: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  createdAt: string;
}

export type Matrix = Record<string, PermKey[]>;
