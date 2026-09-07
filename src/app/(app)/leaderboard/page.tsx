import { requireSession } from "@/lib/authz";
import { config } from "@/features/config";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await requireSession();
  void user;

  if (!config.goldLeaderboardEnabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Gold Leaderboard</h1>
        <p className="text-sm text-muted-foreground">The leaderboard is currently disabled.</p>
      </div>
    );
  }

  const rows = await prisma.goldTransaction.groupBy({
    by: ["memberId"],
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 50,
  });
  const members = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.memberId) } },
    select: { id: true, displayName: true, email: true },
  });
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gold Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Top members by recognition points.</p>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((r, i) => {
            const m = memberMap.get(r.memberId);
            return (
              <div key={r.memberId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-6 text-center font-bold ${i < 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium">{m?.displayName ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{m?.email}</div>
                  </div>
                </div>
                <Badge variant="warning">{r._sum.amount ?? 0} gold</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}