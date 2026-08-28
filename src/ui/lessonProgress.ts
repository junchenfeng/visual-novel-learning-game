import type { CompiledDlc, StoryNode } from "../dlc/schema";

export type SegmentProgress = {
  label: string;
  current: number;
  total: number;
  percent: number;
  detail: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mainStoryNodeIds(dlc: CompiledDlc): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = dlc.story.startNodeId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const node: StoryNode | undefined = dlc.story.nodes[currentId];
    if (!node || node.type === "gameOver") {
      break;
    }
    ids.push(currentId);
    currentId = node.type === "choice" ? node.convergesTo : node.nextNodeId;
  }

  return ids;
}

function storyIndex(dlc: CompiledDlc, nodeId: string): number {
  const path = mainStoryNodeIds(dlc);
  const direct = path.indexOf(nodeId);
  if (direct >= 0) {
    return direct;
  }

  for (const node of Object.values(dlc.story.nodes)) {
    if (node.type === "choice" && node.choices.some((choice) => choice.nextNodeId === nodeId)) {
      const choiceIndex = path.indexOf(node.id);
      return choiceIndex >= 0 ? choiceIndex : 0;
    }
  }

  const current = dlc.story.nodes[nodeId];
  return current ? clamp(current.chapter - 1, 0, Math.max(path.length - 1, 0)) : 0;
}

export function computeStoryProgress(dlc: CompiledDlc, nodeId: string): SegmentProgress {
  const path = mainStoryNodeIds(dlc);
  const total = Math.max(path.length, 1);
  const index = clamp(storyIndex(dlc, nodeId), 0, total - 1);
  const current = index + 1;
  return {
    label: "故事进度",
    current,
    total,
    percent: Math.round((current / total) * 100),
    detail: `${current} / ${total}`,
  };
}

export function computeQuizProgress(index: number, total: number): SegmentProgress {
  const safeTotal = Math.max(total, 1);
  const current = clamp(index + 1, 1, safeTotal);
  return {
    label: "答题进度",
    current,
    total: safeTotal,
    percent: Math.round((current / safeTotal) * 100),
    detail: `${current} / ${safeTotal}`,
  };
}
