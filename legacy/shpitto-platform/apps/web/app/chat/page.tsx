import { redirect } from "next/navigation";
import { createChatSessionForOwner, listChatSessionsForOwner } from "@/lib/agent/chat-task-store";
import { getCachedAuthUser } from "@/lib/supabase/auth-cache";

type ChatEntryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export default async function ChatEntryPage({ searchParams }: ChatEntryPageProps) {
  const user = await getCachedAuthUser();

  if (!user?.id) {
    redirect(`/login?next=${encodeURIComponent("/launch-center")}`);
  }

  const params = await searchParams;
  const prompt = toSingle(params.prompt);
  const from = toSingle(params.from);

  let targetProjectId = "";
  try {
    const sessions = await listChatSessionsForOwner(user.id, { includeArchived: false, limit: 1 });
    if (sessions[0]?.id) {
      targetProjectId = sessions[0].id;
    } else {
      const created = await createChatSessionForOwner({
        ownerUserId: user.id,
        title: "New Project",
      });
      targetProjectId = created.id;
    }
  } catch {
    const created = await createChatSessionForOwner({
      ownerUserId: user.id,
      title: "New Project",
    });
    targetProjectId = created.id;
  }

  const next = new URLSearchParams();
  if (prompt) next.set("prompt", prompt);
  if (from) next.set("from", from);
  const query = next.toString();
  const suffix = query ? `?${query}` : "";
  redirect(`/projects/${encodeURIComponent(targetProjectId)}/chat${suffix}`);
}
