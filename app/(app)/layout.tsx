import { Nav } from "@/components/nav";
import { AiChat } from "@/components/ai-chat";
import { requireSession } from "@/lib/authz";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();

  return (
    <div className="flex min-h-screen">
      <Nav user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6 md:p-8">{children}</div>
      </main>
      <AiChat />
    </div>
  );
}