import { redirect } from "next/navigation";

/**
 * Legacy route — the editor now lives inside `/agents?id=<id>` next to the
 * agent list (single 2-pane layout matching the design mockup).
 */
export default async function EditAgentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/agents?id=${encodeURIComponent(id)}`);
}
