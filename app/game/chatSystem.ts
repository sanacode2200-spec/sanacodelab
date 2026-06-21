import { CHARACTER_ROSTER, characterByName, CharacterStatus } from "./characters";
import { GameCanvasHandle, NotionTask } from "./GameCanvas";
import { appendNotionReport, fetchNotionTasks } from "./notionClient";

export interface ChatLog {
  speaker: string;
  text: string;
  color?: string;
}

// ミーティングで1人ずつ吹き出し表示する台本の1コマ
export interface MeetingBubble {
  id: string;
  name: string;
  color: string;
  text: string;
}

export interface ChatResult {
  logs: ChatLog[];
  tasks?: NotionTask[];
  meetingReports?: string[];
  meetingScript?: MeetingBubble[];
}

// ステータス別セリフ。進行中のみ敬語/タメ口で言い回しを変える。
function lineForTask(title: string, status: CharacterStatus, polite: boolean) {
  if (status === "進行中") return `${title}、${polite ? "進行中です。" : "進めてる。"}`;
  if (status === "完了") return `${title}、終わりました。`;
  return `${title}、まだ手をつけてません。`;
}

interface TaskLike {
  title: string;
  status: CharacterStatus;
}

// 各キャラが「直近で終わったこと(完了)」と「現在のタスク(進行中>未着手)」を報告する台本を組む。
// 部署順=ROSTER順。Notionにその部署のタスクが無ければ fallback(キャラの固定タスク)を使う。
function buildMeetingScript(tasks: NotionTask[], fallback: Map<string, TaskLike>): MeetingBubble[] {
  return CHARACTER_ROSTER.map((character) => {
    const deptTasks: TaskLike[] = tasks.filter((task) => task.department === character.department);
    const polite = character.speechStyle === "敬語";

    const completed = deptTasks.filter((t) => t.status === "完了");
    const recentDone = completed.length ? completed[completed.length - 1] : undefined; // 直近で終わったこと
    const current =
      deptTasks.find((t) => t.status === "進行中") ?? deptTasks.find((t) => t.status === "未着手"); // 現在のタスク

    const picks: TaskLike[] = [];
    if (recentDone) picks.push(recentDone);
    if (current) picks.push(current);
    if (picks.length === 0) {
      const own = fallback.get(character.department);
      if (own) picks.push(own);
    }

    const text = picks.length
      ? picks.map((task) => lineForTask(task.title, task.status, polite)).join(" ")
      : "特にありません。";
    return { id: character.id, name: character.name, color: character.color, text };
  });
}

export async function handleChatCommand(input: string, game: GameCanvasHandle | null): Promise<ChatResult> {
  const message = input.trim();
  const logs: ChatLog[] = [];
  if (!message) return { logs };

  if (message === "進捗確認") {
    const tasks = await fetchNotionTasks();
    game?.setTasks(tasks);
    const done = tasks.filter((task) => task.status === "完了").length;
    logs.push({ speaker: "Notion", text: `進捗は ${done}/${tasks.length} 完了です。` });
    for (const task of tasks.slice(0, 5)) logs.push({ speaker: task.department, text: `${task.title}: ${task.status}` });
    return { logs, tasks };
  }

  if (message === "全員集合" || message === "ミーティング") {
    game?.gatherAll(true);
    // 最新のNotionタスクを取得してキャラ状態へ反映し、進捗読み上げ台本を作る
    let tasks: NotionTask[] = [];
    try {
      tasks = await fetchNotionTasks();
      game?.setTasks(tasks);
    } catch {
      // Notion未設定時は固定タスクのまま台本を作る
    }
    const fallback = new Map<string, TaskLike>();
    for (const snap of game?.getCharacterSnapshot() ?? []) {
      fallback.set(snap.department, { title: snap.task, status: snap.status });
    }
    const script = buildMeetingScript(tasks, fallback);
    logs.push({ speaker: "system", text: "ミーティングを始めます。各部署、進捗をどうぞ。" });
    const reports = script.map((bubble) => `${bubble.name}: ${bubble.text}`);
    await Promise.allSettled(script.map((bubble) => appendNotionReport(bubble.text, bubble.name)));
    return { logs, meetingReports: reports, meetingScript: script };
  }

  if (message === "解散") {
    game?.dismissAll();
    logs.push({ speaker: "system", text: "各部署のデスクに戻ります。" });
    return { logs };
  }

  const reportMatch = message.match(/^(.+?)\s*報告[:：]\s*(.+)$/);
  if (reportMatch) {
    const character = characterByName(reportMatch[1]);
    if (!character) return { logs: [{ speaker: "system", text: "報告する相手の名前が見つかりません。" }] };
    await appendNotionReport(reportMatch[2], character.name);
    logs.push({ speaker: character.name, text: character.line, color: character.color });
    return { logs };
  }

  const comeMatch = message.match(/^(.+?)\s*来て$/);
  if (comeMatch) {
    const character = game?.callCharacter(comeMatch[1]) ?? characterByName(comeMatch[1]);
    if (!character) return { logs: [{ speaker: "system", text: "呼び出す相手の名前が見つかりません。" }] };
    logs.push({ speaker: character.name, text: character.line, color: character.color });
    return { logs };
  }

  const character = CHARACTER_ROSTER.find((item) => message.includes(item.name));
  if (character) {
    game?.callCharacter(character.name);
    logs.push({ speaker: character.name, text: character.line, color: character.color });
  } else {
    logs.push({ speaker: "system", text: "「アオイ 来て」「全員集合」「進捗確認」「アオイ 報告:内容」の形で話せます。" });
  }
  return { logs };
}
