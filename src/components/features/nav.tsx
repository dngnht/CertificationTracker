"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, LayoutDashboard, LogOut, Users, BookOpen, ClipboardList, BarChart3, Trophy, Sparkles, Network, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(app)/logout-action";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  children?: { href: string; label: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-certifications", label: "My Certifications", icon: BookOpen },
  { href: "/recommended", label: "Recommended", icon: Sparkles },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/certification-plan", label: "Certification Plan", icon: ClipboardList, adminOnly: true },
  { href: "/admin/members", label: "Members", icon: Users, adminOnly: true },
  { href: "/admin/departments", label: "Departments", icon: Network, adminOnly: true },
  { href: "/admin/departments/analytics", label: "Dept Analytics", icon: BarChart3, adminOnly: true },
  { href: "/admin/departments/targets", label: "Dept Targets", icon: ClipboardList, adminOnly: true },
  { href: "/admin/certifications", label: "Certifications", icon: Award, adminOnly: true },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck, adminOnly: true },
];

const REPORT_ITEMS = [
  { href: "/admin/reports/overdue", label: "Overdue" },
  { href: "/admin/reports/missing", label: "Missing" },
  { href: "/admin/reports/upcoming", label: "Upcoming" },
  { href: "/admin/reports/expiring", label: "Expiring" },
];

export function Nav({ user }: { user: { name?: string | null; email?: string | null; role: string } }) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Award className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold">Certification Tracker</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <div className="pt-2">
            <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Reports
            </div>
            <div className="ml-4 space-y-1">
              {REPORT_ITEMS.map((r) => {
                const active = pathname === r.href;
                return (
                  <Link
                    key={r.href}
                    href={r.href}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {r.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{user.name ?? user.email}</span>
                <span className="text-xs text-muted-foreground">{isAdmin ? "Admin" : "Member"}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                // Server-action signout: xoá cookie + redirect server-side,
                // tránh router cache client giữ trang cũ sau khi đăng xuất.
                void signOutAction();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}