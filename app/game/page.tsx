"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas, { GameCanvasHandle, NearCharacter } from "./GameCanvas";
import { handleChatCommand, ChatLog } from "./chatSystem";
import { fetchNotionTasks } from "./notionClient";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span>{now.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}</span>;
}

export default function GamePage() {
  const gameRef = useRef<GameCanvasHandle | null>(null);
  const [near, setNear] = useState<NearCharacter | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(7);
  const [log, setLog] = useState<ChatLog[]>([
    { speaker: "system", text: "小さな星のオフィスへようこそ。WASDで歩けます。" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [meeting, setMeeting] = useState<string[]>([]);

  const append = useCallback((entries: ChatLog[]) => {
    setLog((prev) => [...prev, ...entries].slice(-24));
  }, []);

  const onProgressChange = useCallback((nextDone: number, nextTotal: number) => {
    setDone(nextDone);
    setTotal(nextTotal);
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const tasks = await fetchNotionTasks();
        if (!active) return;
        gameRef.current?.setTasks(tasks);
      } catch {
        if (active) append([{ speaker: "Notion", text: "Notion未設定のため、固定タスクで動作しています。" }]);
      }
    };
    poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [append]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    append([{ speaker: "あなた", text: message }]);
    try {
      const result = await handleChatCommand(message, gameRef.current);
      append(result.logs);
      setMeeting(result.meetingReports ?? (message === "解散" ? [] : meeting));
    } catch {
      append([{ speaker: "system", text: "コマンド処理に失敗しました。" }]);
    } finally {
      setSending(false);
    }
  }, [append, input, meeting, sending]);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#dff7ff] text-slate-900">
      <GameCanvas ref={gameRef} onNearChange={setNear} onProgressChange={onProgressChange} />

      <header className="absolute left-4 top-4 pointer-events-none text-slate-800 drop-shadow-sm">
        <div className="text-xl font-semibold tracking-normal">sanacode Lab</div>
        <div className="text-sm text-slate-600"><Clock /></div>
      </header>

      <section className="absolute right-4 top-4 min-w-40 rounded-md border border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur">
        <div className="text-xs font-semibold text-slate-500">Notion Tasks</div>
        <div className="mt-1 text-2xl font-semibold">{done}/{total}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-[#3eb489]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </section>

      {near && (
        <section className="absolute left-1/2 top-20 w-72 -translate-x-1/2 rounded-md border bg-white/85 px-4 py-3 text-sm shadow-sm backdrop-blur" style={{ borderColor: near.color }}>
          <div className="font-semibold" style={{ color: near.color }}>{near.name} / {near.department}</div>
          <div className="mt-1 text-slate-700">{near.task}</div>
          <div className="text-xs text-slate-500">状態: {near.status}</div>
        </section>
      )}

      {meeting.length > 0 && (
        <section className="absolute left-1/2 top-4 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-white/80 bg-white/82 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mb-2 text-sm font-semibold text-slate-700">Meeting</div>
          <div className="grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
            {meeting.map((line) => <div key={line}>{line}</div>)}
          </div>
        </section>
      )}

      <div className="absolute bottom-4 left-4 rounded-md border border-white/70 bg-white/70 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur">
        WASD / 矢印キー / スワイプ
      </div>

      <section className="absolute bottom-4 right-4 w-[min(380px,calc(100vw-2rem))] rounded-md border border-white/75 bg-white/82 p-3 shadow-sm backdrop-blur">
        <div className="mb-3 max-h-40 space-y-1 overflow-y-auto pr-1 text-sm">
          {log.slice(-5).map((entry, i) => (
            <div key={`${entry.speaker}-${i}`} className="leading-snug">
              <span className="font-semibold" style={{ color: entry.color ?? "#475569" }}>{entry.speaker}: </span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="アオイ 来て / 進捗確認"
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <button
            onClick={send}
            disabled={sending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </section>
    </main>
  );
}
