import { requireSession } from "@/lib/authz";
import { getRecommendedCatalog } from "@/features/recommended/queries";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AddToPlanButton } from "./add-to-plan-button";

export const dynamic = "force-dynamic";

export default async function RecommendedPage() {
  const user = await requireSession();
  const { catalog, balance, recent } = await getRecommendedCatalog(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recommended Certifications</h1>
        <p className="text-sm text-muted-foreground">
          Certifications the company recommends. Earn gold for each verified certification.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Gold Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-500">{balance}</p>
            <p className="text-sm text-muted-foreground">Recognition points earned</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Awards</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gold activity yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span>
                      {t.reason === "CERT_AWARD" ? (
                        <>Earned {t.certification?.code ?? "certificate"}</>
                      ) : (
                        t.note ?? t.reason.replace("_", " ")
                      )}
                    </span>
                    <span className={t.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                      {t.amount >= 0 ? "+" : ""}
                      {t.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {catalog.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{c.code}</CardTitle>
                  <CardDescription>{c.name}</CardDescription>
                </div>
                <Badge variant="warning" className="shrink-0">
                  {c.goldReward} gold
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{c.provider}</p>
              {c.recommendedNote && <p className="text-sm italic">{c.recommendedNote}</p>}
              {c.memberStatus ? (
                <div className="space-y-2">
                  <StatusBadge status={c.memberStatus} />
                  <div className="flex items-center gap-2">
                    <Progress value={c.memberProgress} className="flex-1" />
                    <span className="text-xs text-muted-foreground">{c.memberProgress}%</span>
                  </div>
                </div>
              ) : (
                <AddToPlanButton certCode={c.code} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}