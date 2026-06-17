import { CHARACTER_ROSTER, characterByName } from "./characters";
import { GameCanvasHandle, NotionTask } from "./GameCanvas";
import { appendNotionReport, fetchNotionTasks } from "./notionClient";

export interface ChatLog {
  speaker: string;
  text: string;
  color?: string;
}

export interface ChatResult {
  logs: ChatLog[];
  tasks?: NotionTask[];
  meetingReports?: string[];
}

function reportLine(character: { name: string; department: string; task: string; status: string }) {
  return `${character.department}の${character.name}です。${character.task}は「${character.status}」です。`;
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
    const snapshot = game?.getCharacterSnapshot() ?? [];
    const reports = snapshot.map(reportLine);
    for (const line of reports) logs.push({ speaker: "meeting", text: line });
    await Promise.allSettled(reports.map((content) => appendNotionReport(content, "meeting")));
    return { logs, meetingReports: reports };
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
