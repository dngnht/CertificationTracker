"use server";

import { signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Đăng xuất server-side: xoá session cookie rồi redirect về /login.
 * Làm ở server (không qua router cache client) để tránh hydration mismatch
 * và race giữa xoá cookie với navigation.
 */
export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}