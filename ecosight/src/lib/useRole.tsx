"use client";

import { useUser } from "@clerk/nextjs";

export type UserRole = "admin" | "worker";

export function useRole(): { role: UserRole; isAdmin: boolean; isWorker: boolean; isLoaded: boolean } {
  const { user, isLoaded } = useUser();
  const role = (user?.publicMetadata?.role as UserRole) ?? "worker";
  return {
    role,
    isAdmin: role === "admin",
    isWorker: role === "worker",
    isLoaded,
  };
}
