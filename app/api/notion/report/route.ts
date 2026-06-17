import { Client } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function formatLocalDate(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  const pageId = process.env.NOTION_PROJECT_PAGE_ID;
  if (!token || !pageId) return NextResponse.json({ ok: true, skipped: true });

  let body: { content?: unknown; character?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim().slice(0, 1200) : "";
  const character = typeof body.character === "string" ? body.character.trim().slice(0, 80) : "system";
  if (!content) return NextResponse.json({ ok: false }, { status: 400 });

  const line = `[${formatLocalDate(new Date())}] ${character}: ${content}`;
  const notion = new Client({ auth: token });

  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: `次アクション ${line}` } }],
          },
        },
      ],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Notion report error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
