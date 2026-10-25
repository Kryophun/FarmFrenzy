import { chooseAiMove } from "./ai.js";
import type { AiProgress, AiRequest, AiResponse, SkillLevel } from "./ai.js";

// Keep already-open games working until their UI is refreshed.
type LegacyDifficulty = "easy" | "medium" | "hard";
interface LegacyRequest {
  state: AiRequest["state"];
  difficulty: LegacyDifficulty;
}
const legacyLevels: Record<LegacyDifficulty, SkillLevel> = { easy: 1, medium: 4, hard: 10 };

self.addEventListener("message", (event: MessageEvent<AiRequest | LegacyRequest>) => {
  let response: AiResponse;
  try {
    const request = event.data;
    const legacyDifficulty = "difficulty" in request ? request.difficulty : null;
    const skill = "skill" in request ? request.skill : legacyLevels[request.difficulty];
    let lastUpdate = -Infinity;
    const reportProgress = (progress: AiProgress): void => {
      const now = performance.now();
      if (progress.phase === "complete" || now - lastUpdate >= 80) {
        const payload = legacyDifficulty === null ? progress : {
          ...progress,
          difficulty: legacyDifficulty,
          bestMove: progress.phase === "complete" ? progress.selectedMove : progress.bestMove,
        };
        self.postMessage({ type: "progress", progress: payload } satisfies AiResponse);
        lastUpdate = now;
      }
    };
    response = {
      type: "move",
      move: chooseAiMove(request.state, skill, Math.random, reportProgress),
    };
  } catch (error) {
    console.error("AI move selection failed:", error);
    response = { type: "error", message: error instanceof Error ? error.message : "The AI could not select a move." };
  }
  self.postMessage(response);
});
