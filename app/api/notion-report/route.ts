import { Client } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";

const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID || "08e96ff6-653e-4c4c-a0a5-0fd874d8bb95";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { content: rawContent } = body as { content?: unknown };
  const content = typeof rawContent === "string" ? rawContent.slice(0, 2000).trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false });
  }

  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const dateStr = new Date().toISOString().slice(0, 10);

  try {
    await notion.blocks.children.append({
      block_id: NOTION_PAGE_ID,
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: `[${dateStr}] ${content}` } }],
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
