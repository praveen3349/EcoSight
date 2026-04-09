import { auth } from "@clerk/nextjs/server";

export type UserRole = "admin" | "worker";

export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as any)?.role;
  return role === "admin" ? "admin" : "worker";
}

export function getRoleFromClaims(sessionClaims: any): UserRole {
  const role = (sessionClaims?.metadata as any)?.role;
  return role === "admin" ? "admin" : "worker";
}
