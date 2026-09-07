import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect(session.user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  let devUsers: { id: string; email: string; displayName: string; role: string }[] = [];
  const devEnabled = process.env.AUTH_ENABLE_DEV_LOGIN === "true" || process.env.NODE_ENV !== "production";
  if (devEnabled) {
    devUsers = await prisma.user.findMany({
      select: { id: true, email: true, displayName: true, role: true },
      orderBy: { displayName: "asc" },
    });
  }

  const microsoftConfigured = Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <LoginForm
        microsoftConfigured={microsoftConfigured}
        devEnabled={devEnabled}
        devUsers={devUsers}
      />
    </div>
  );
}