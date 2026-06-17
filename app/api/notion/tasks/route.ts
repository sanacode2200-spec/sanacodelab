import { Client } from "@notionhq/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Status = "未着手" | "進行中" | "完了";

function textFromProperty(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  const plain = (items: unknown) =>
    Array.isArray(items)
      ? items
          .map((item) => (item && typeof item === "object" && "plain_text" in item ? String(item.plain_text ?? "") : ""))
          .join("")
      : "";
  const optionName = (item: unknown) =>
    item && typeof item === "object" && "name" in item ? String(item.name ?? "") : "";

  if (p.type === "title") return plain(p.title);
  if (p.type === "rich_text") return plain(p.rich_text);
  if (p.type === "select") return optionName(p.select);
  if (p.type === "status") return optionName(p.status);
  if (p.type === "multi_select") return Array.isArray(p.multi_select) ? p.multi_select.map(optionName).join(", ") : "";
  return "";
}

function normalizeStatus(value: string): Status {
  if (value.includes("完了") || value.toLowerCase().includes("done")) return "完了";
  if (value.includes("進行") || value.toLowerCase().includes("progress")) return "進行中";
  return "未着手";
}

function pick(properties: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (properties[name]) return textFromProperty(properties[name]);
  }
  return "";
}

export async function GET() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_TASK_DB_ID;
  if (!token || !databaseId) {
    return NextResponse.json({ tasks: [], skipped: true });
  }

  try {
    const notion = new Client({ auth: token });
    const response = await notion.dataSources.query({ data_source_id: databaseId, page_size: 100 });
    const tasks = response.results
      .filter((page): page is typeof page & { properties: Record<string, unknown>; id: string } => "properties" in page)
      .map((page) => {
        const properties = page.properties;
        const title =
          pick(properties, ["名前", "Name", "タスク", "Task", "title"]) ||
          Object.values(properties).map(textFromProperty).find(Boolean) ||
          "無題タスク";
        const department = pick(properties, ["担当部署", "部署", "Department", "department"]);
        const status = normalizeStatus(pick(properties, ["ステータス", "Status", "状態"]));
        return { id: page.id, title, department, status };
      })
      .filter((task) => task.department);

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Notion tasks error", error);
    return NextResponse.json({ tasks: [], ok: false }, { status: 500 });
  }
}
