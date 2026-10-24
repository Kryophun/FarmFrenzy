import { chooseAiMove } from "./ai.js";
import type { AiProgress, AiRequest, AiResponse } from "./ai.js";

self.addEventListener("message", (event: MessageEvent<AiRequest>) => {
  let response: AiResponse;
  try {
    let lastUpdate = -Infinity;
    const reportProgress = (progress: AiProgress): void => {
      const now = performance.now();
      if (progress.phase === "complete" || now - lastUpdate >= 80) {
        self.postMessage({ type: "progress", progress } satisfies AiResponse);
        lastUpdate = now;
      }
    };
    response = {
      type: "move",
      move: chooseAiMove(event.data.state, event.data.difficulty, Math.random, reportProgress),
    };
  } catch (error) {
    console.error("AI move selection failed:", error);
    response = { type: "error", message: error instanceof Error ? error.message : "The AI could not select a move." };
  }
  self.postMessage(response);
});
