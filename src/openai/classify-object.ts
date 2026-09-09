import { field, runNullEngine, type EngineOutput } from "../knowledge/null-engine";

export interface CandidateFields {
  [name: string]: { state?: string; value?: unknown; reason?: string };
}

export function classifyCandidates(candidates: CandidateFields, required: string[]): EngineOutput {
  const fields: Record<string, ReturnType<typeof field>> = {};
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  for (const [name, c] of Object.entries(candidates)) {
    if (!hasKey && c.value === undefined) {
      fields[name] = field("NOT_LOADED", null, "OPENAI_API_KEY_NOT_SET");
      continue;
    }
    if (c.value === undefined || c.value === null) {
      fields[name] = field("UNKNOWN", null, c.reason ?? "candidate_empty");
      continue;
    }
    fields[name] = field("UNVERIFIED", null, "model_candidate_not_receipt");
  }
  return runNullEngine({ fields, required });
}
