"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Award, Building2, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DevUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export function LoginForm({
  microsoftConfigured,
  devEnabled,
  devUsers,
}: {
  microsoftConfigured: boolean;
  devEnabled: boolean;
  devUsers: DevUser[];
}) {
  const [busy, setBusy] = useState(false);

  async function handleMicrosoft() {
    setBusy(true);
    await signIn("microsoft-entra-id", { callbackUrl: "/dashboard" });
  }

  async function handleDevLogin(email: string) {
    setBusy(true);
    // redirect: false + window.location.href → hard reload để xoá router cache,
    // tránh hydration mismatch (trang lỗi "blocked content") sau khi đổi session.
    const res = await signIn("dev-login", { email, redirect: false });
    if (res?.ok) {
      window.location.href = "/dashboard";
    } else {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Award className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl">Certification Tracker</CardTitle>
        <CardDescription>Sign in to view and manage certification plans</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {microsoftConfigured && (
          <Button className="w-full" size="lg" onClick={handleMicrosoft} disabled={busy}>
            <Building2 className="h-4 w-4" />
            Sign in with Microsoft
          </Button>
        )}

        {!microsoftConfigured && (
          <p className="rounded-md bg-muted p-3 text-center text-xs text-muted-foreground">
            Microsoft Entra ID is not configured. Add credentials to enable SSO.
          </p>
        )}

        {devEnabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Development login
              <span className="h-px flex-1 bg-border" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between" disabled={busy}>
                  Choose a seeded user
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-72">
                {devUsers.map((u) => (
                  <DropdownMenuItem key={u.id} onClick={() => handleDevLogin(u.email)}>
                    <span className="flex flex-col">
                      <span>{u.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.email} · {u.role}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardContent>
    </Card>
  );
}