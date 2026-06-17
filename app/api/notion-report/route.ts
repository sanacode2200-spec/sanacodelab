import { Client } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";

// 「プロジェクト」データソース内の sanacode Lab Messenger プロジェクトページ
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID || "38225cd7-db8f-815f-b213-f6ae003f0c5e";
const NEXT_ACTION_PROPERTY = "次アクション";
const MAX_PROPERTY_LENGTH = 1900;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { content: rawContent } = body as { content?: unknown };
  const content = typeof rawContent === "string" ? rawContent.slice(0, 500).trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false });
  }

  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const dateStr = new Date().toISOString().slice(0, 10);

  try {
    const page = await notion.pages.retrieve({ page_id: NOTION_PAGE_ID });
    const existing =
      "properties" in page && page.properties[NEXT_ACTION_PROPERTY]?.type === "rich_text"
        ? page.properties[NEXT_ACTION_PROPERTY].rich_text.map((t) => t.plain_text).join("")
        : "";

    let updated = `${existing}${existing ? "\n" : ""}[${dateStr}] ${content}`;
    if (updated.length > MAX_PROPERTY_LENGTH) {
      updated = updated.slice(updated.length - MAX_PROPERTY_LENGTH);
    }

    await notion.pages.update({
      page_id: NOTION_PAGE_ID,
      properties: {
        [NEXT_ACTION_PROPERTY]: {
          rich_text: [{ type: "text", text: { content: updated } }],
        },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Notion report error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
