import type { StoryNode } from "./schema";

export type GraphValidationResult = {
  ok: boolean;
  errors: string[];
};

function outgoingIds(node: StoryNode): string[] {
  if (node.type === "narration" || node.type === "fact") {
    return node.nextNodeId ? [node.nextNodeId] : [];
  }
  if (node.type === "gameOver") {
    return [];
  }
  return node.choices.map((choice) => choice.nextNodeId);
}

function reaches(
  nodes: Map<string, StoryNode>,
  fromId: string,
  targetId: string,
  visiting: Set<string>,
): boolean {
  if (fromId === targetId) {
    return true;
  }
  if (visiting.has(fromId)) {
    return false;
  }
  const node = nodes.get(fromId);
  if (!node) {
    return false;
  }
  visiting.add(fromId);
  return outgoingIds(node).some((nextId) =>
    reaches(nodes, nextId, targetId, visiting),
  );
}

export function validateStoryGraph(
  startNodeId: string,
  nodes: StoryNode[],
): GraphValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, StoryNode>();

  for (const node of nodes) {
    if (seen.has(node.id)) {
      errors.push(`重复的节点 id：${node.id}`);
    }
    seen.add(node.id);
    byId.set(node.id, node);
  }

  if (!byId.has(startNodeId)) {
    errors.push(`起始节点不存在：${startNodeId}`);
  } else if (byId.get(startNodeId)?.type === "gameOver") {
    errors.push("起始节点不能是 gameOver");
  }

  for (const node of nodes) {
    for (const nextId of outgoingIds(node)) {
      if (!byId.has(nextId)) {
        errors.push(`节点 ${node.id} 引用了不存在的节点：${nextId}`);
      }
    }
    if ((node.type === "narration" || node.type === "fact") && node.nextNodeId) {
      const next = byId.get(node.nextNodeId);
      if (next?.type === "gameOver") {
        errors.push(
          `${node.type === "fact" ? "史实" : "旁白"}节点 ${node.id} 不能直接进入结局，gameOver 只能由选项进入`,
        );
      }
    }
    if (node.type === "choice") {
      if (!byId.has(node.convergesTo)) {
        errors.push(`选择节点 ${node.id} 的 convergesTo 不存在：${node.convergesTo}`);
      }
      const choiceIds = new Set<string>();
      for (const choice of node.choices) {
        if (choiceIds.has(choice.id)) {
          errors.push(`选择节点 ${node.id} 有重复选项 id：${choice.id}`);
        }
        choiceIds.add(choice.id);
        const next = byId.get(choice.nextNodeId);
        if (next?.type === "gameOver") {
          continue;
        }
        if (
          byId.has(choice.nextNodeId) &&
          !reaches(byId, choice.nextNodeId, node.convergesTo, new Set())
        ) {
          errors.push(
            `选择节点 ${node.id} 的选项 ${choice.id} 无法汇流到 ${node.convergesTo}`,
          );
        }
      }
    }
  }

  const reachable = new Set<string>();
  const stack = byId.has(startNodeId) ? [startNodeId] : [];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (reachable.has(currentId)) {
      continue;
    }
    reachable.add(currentId);
    const current = byId.get(currentId);
    if (current) {
      stack.push(...outgoingIds(current));
    }
  }

  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      errors.push(`不可达节点：${node.id}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const detectCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    const hasCycle = node
      ? outgoingIds(node).some((nextId) => detectCycle(nextId))
      : false;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return hasCycle;
  };

  if (byId.has(startNodeId) && detectCycle(startNodeId)) {
    errors.push("剧情图存在循环，主线必须是有向无环图");
  }

  const terminalNodes = nodes.filter((node) => outgoingIds(node).length === 0);
  if (reachable.size > 0 && terminalNodes.every((node) => !reachable.has(node.id))) {
    errors.push("从起始节点无法到达任何结束节点");
  }

  return { ok: errors.length === 0, errors };
}
