// Chart colours (categorical slots 1–3, validated for colour-vision deficiency on the light surface)
import type { ScenarioKey } from "./model";

export const SCENARIO_COLOR: Record<ScenarioKey, string> = {
  base: "#2a78d6",
  worst: "#eb6834",
  best: "#1baf7a"
};

export const C = {
  increase: "#2a78d6",
  decrease: "#eb6834",
  total: "#3f3f46",
  reference: "#71717a",
  grid: "#e4e4e7",
  axis: "#71717a"
};
