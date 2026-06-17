"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlanetGame, NearInfo } from "./planetGame";
import { CHARACTERS, CharacterData } from "@/lib/characters";

interface LogEntry {
  speaker: string;
  text: string;
  color?: string;
}

function Joystick({ onChange }: { onChange: (turn: number, forward: number) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const maxRadius = 42;

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      setKnob({ x: dx, y: dy });
      onChange(-dx / maxRadius, -dy / maxRadius);
    },
    [onChange]
  );

  const stop = useCallback(() => {
    draggingRef.current = false;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        draggingRef.current = true;
        handleMove(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) handleMove(e.clientX, e.clientY);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="relative w-28 h-28 rounded-full bg-white/10 border border-white/30 touch-none select-none"
    >
      <div
        className="absolute w-12 h-12 rounded-full bg-white/60"
        style={{
          left: `calc(50% - 24px + ${knob.x}px)`,
          top: `calc(50% - 24px + ${knob.y}px)`,
        }}
      />
    </div>
  );
}

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<PlanetGame | null>(null);
  const dialogueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nearInfo, setNearInfo] = useState<NearInfo | null>(null);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(0);
  const [total, setTotal] = useState(CHARACTERS.length);
  const [cleared, setCleared] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new PlanetGame(canvasRef.current, {
      onNear: (info) => setNearInfo(info),
      onDeliver: (data: CharacterData) => {
        if (dialogueTimeoutRef.current) clearTimeout(dialogueTimeoutRef.current);
        setDialogue(`${data.name}「${data.deliverLine}」`);
        dialogueTimeoutRef.current = setTimeout(() => setDialogue(null), 3000);
      },
      onProgress: (d, t) => {
        setDelivered(d);
        setTotal(t);
      },
      onClear: () => setCleared(true),
    });
    game.start();
    gameRef.current = game;

    return () => {
      game.dispose();
      gameRef.current = null;
      if (dialogueTimeoutRef.current) clearTimeout(dialogueTimeoutRef.current);
    };
  }, []);

  const appendLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [...prev.slice(-4), entry]);
  }, []);

  const handleSend = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || sending) return;
    setChatInput("");
    appendLog({ speaker: "あなた", text: message });

    const game = gameRef.current;
    const calledIds: string[] = [];
    if (game) {
      if (message.includes("全員集合")) {
        game.gatherAll();
        calledIds.push(...CHARACTERS.map((c) => c.id));
      } else {
        for (const c of CHARACTERS) {
          if (message.includes(c.name)) {
            game.callCharacterByName(c.name);
            calledIds.push(c.id);
          }
        }
      }
    }

    fetch("/api/notion-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    }).catch(() => {});

    const proximityIds = game ? game.getArrivedCharacterIds() : [];
    const characterIds = Array.from(new Set([...calledIds, ...proximityIds]));
    if (characterIds.length === 0) {
      appendLog({ speaker: "system", text: "誰も近くにいないようです。名前を呼ぶか「全員集合」と送ってみてください。" });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, characterIds }),
      });
      const data = await res.json();
      if (Array.isArray(data.replies)) {
        for (const reply of data.replies) {
          const charData = CHARACTERS.find((c) => c.id === reply.characterId);
          if (charData) {
            appendLog({ speaker: charData.name, text: reply.text, color: charData.color });
          }
        }
      }
    } catch {
      appendLog({ speaker: "system", text: "通信エラーが発生しました。" });
    } finally {
      setSending(false);
    }
  }, [chatInput, sending, appendLog]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute top-4 left-4 text-white font-bold text-lg drop-shadow-lg pointer-events-none">
        残り配達: {total - delivered} / {total}
      </div>

      {nearInfo && !dialogue && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 text-white text-sm pointer-events-none border"
          style={{ borderColor: nearInfo.color }}
        >
          <span style={{ color: nearInfo.color }}>{nearInfo.name}</span>
          <span className="ml-2 text-white/80">{nearInfo.department}</span>
        </div>
      )}

      {dialogue && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl bg-black/75 text-white text-base max-w-[80vw] text-center pointer-events-none">
          {dialogue}
        </div>
      )}

      <div className="hidden [@media(pointer:coarse)]:block absolute bottom-6 left-6">
        <Joystick onChange={(turn, forward) => gameRef.current?.setVirtualMove(turn, forward)} />
      </div>

      <div className="absolute bottom-4 right-4 w-80 max-w-[90vw] bg-black/55 rounded-lg p-3 text-white text-sm">
        <div className="flex flex-col gap-1 mb-2 max-h-32 overflow-y-auto">
          {log.map((entry, i) => (
            <div key={i}>
              <span className="font-bold" style={{ color: entry.color ?? "#cccccc" }}>
                {entry.speaker}:
              </span>{" "}
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="名前を呼ぶ、または「全員集合」"
            className="flex-1 px-2 py-1 rounded bg-white/10 border border-white/30 text-white placeholder-white/40 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </div>

      {cleared && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <div className="text-3xl font-bold mb-4">全7部署 配達完了!</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded bg-white/20 hover:bg-white/30"
            >
              もう一度プレイ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
