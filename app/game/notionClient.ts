import { NotionTask } from "./GameCanvas";

export async function fetchNotionTasks(): Promise<NotionTask[]> {
  const res = await fetch("/api/notion/tasks", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch Notion tasks");
  const data = (await res.json()) as { tasks?: NotionTask[] };
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export async function appendNotionReport(content: string, character = "system") {
  const res = await fetch("/api/notion/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, character }),
  });
  if (!res.ok) throw new Error("Failed to append Notion report");
  return res.json() as Promise<{ ok: boolean; skipped?: boolean }>;
}
