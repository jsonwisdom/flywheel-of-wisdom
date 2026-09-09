/**
 * null-engine v0.1
 * Classifies blanks. Jason is not the null interpreter.
 * MISSING ≠ UNKNOWN ≠ NOT_LOADED ≠ NULL ≠ FALSE
 */

import type { FieldEvidence, FieldState, TypedField } from "./knowledge-object";

export type EngineStatus = "COMPLETE" | "PARTIAL" | "BLOCKED" | "CONFLICTED";

export interface TransitionReceipt {
  field: string;
  from: FieldState;
  to: FieldState;
  allowed: boolean;
  reason: string;
}

const ALLOWED: Record<FieldState, FieldState[]> = {
  PRESENT: ["PRESENT", "REDACTED", "DELETED", "CONFLICT", "UNVERIFIED"],
  MISSING: ["MISSING", "PRESENT", "UNKNOWN", "NOT_APPLICABLE", "NOT_LOADED", "UNAVAILABLE"],
  UNKNOWN: ["UNKNOWN", "PRESENT", "UNVERIFIED", "MISSING", "NOT_APPLICABLE", "CONFLICT"],
  NOT_APPLICABLE: ["NOT_APPLICABLE"],
  NOT_REQUESTED: ["NOT_REQUESTED", "NOT_LOADED", "MISSING", "PRESENT"],
  NOT_LOADED: ["NOT_LOADED", "PRESENT", "MISSING", "UNKNOWN", "UNAVAILABLE", "UNVERIFIED"],
  UNVERIFIED: ["UNVERIFIED", "PRESENT", "CONFLICT", "REDACTED"],
  CONFLICT: ["CONFLICT", "UNVERIFIED"],
  REDACTED: ["REDACTED"],
  DELETED: ["DELETED"],
  UNAVAILABLE: ["UNAVAILABLE", "NOT_LOADED", "MISSING"],
};

export function field<T>(
  state: FieldState,
  value: T | null = null,
  reason?: string,
  evidence: FieldEvidence[] = []
): TypedField<T> {
  if (state === "PRESENT" && (value === null || value === undefined)) {
    return { state: "CONFLICT", value: null, evidence, reason: reason ?? "PRESENT_WITHOUT_VALUE" };
  }
  if (state !== "PRESENT" && state !== "REDACTED" && value !== null) {
    return { state: "CONFLICT", value: null, evidence, reason: reason ?? "VALUE_WITH_NON_PRESENT_STATE" };
  }
  return { state, value, evidence, reason };
}

export function canTransition(from: FieldState, to: FieldState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function applyTransition<T>(
  current: TypedField<T>,
  to: FieldState,
  value: T | null,
  reason: string,
  evidence: FieldEvidence[] = []
): { field: TypedField<T>; receipt: TransitionReceipt } {
  const allowed = canTransition(current.state, to);
  if (!allowed) {
    return {
      field: {
        state: "CONFLICT",
        value: null,
        evidence: [...current.evidence, ...evidence],
        reason: `FORBIDDEN_TRANSITION ${current.state}→${to}`,
      },
      receipt: { field: "", from: current.state, to, allowed: false, reason: `FORBIDDEN_TRANSITION ${current.state}→${to}` },
    };
  }
  const next = field(to, value, reason, [...current.evidence, ...evidence]);
  return {
    field: next,
    receipt: { field: "", from: current.state, to: next.state, allowed: true, reason },
  };
}

export interface EngineInput {
  fields: Record<string, TypedField>;
  required: string[];
}

export interface EngineOutput {
  status: EngineStatus;
  fields: Record<string, TypedField>;
  receipts: TransitionReceipt[];
  missing_required: string[];
  conflicts: string[];
  not_loaded: string[];
}

export function runNullEngine(input: EngineInput): EngineOutput {
  const receipts: TransitionReceipt[] = [];
  const fields: Record<string, TypedField> = {};
  const missing_required: string[] = [];
  const conflicts: string[] = [];
  const not_loaded: string[] = [];

  for (const [name, raw] of Object.entries(input.fields)) {
    let f = raw;
    if (f.state === "PRESENT" && (f.value === null || f.value === undefined)) {
      f = field("CONFLICT", null, "PRESENT_WITHOUT_VALUE", f.evidence);
    }
    fields[name] = f;
    receipts.push({ field: name, from: raw.state, to: f.state, allowed: true, reason: f.reason ?? "CLASSIFIED" });
    if (f.state === "CONFLICT") conflicts.push(name);
    if (f.state === "NOT_LOADED") not_loaded.push(name);
  }

  for (const name of input.required) {
    const f = fields[name];
    if (!f) {
      fields[name] = field("MISSING", null, "REQUIRED_FIELD_ABSENT");
      missing_required.push(name);
      continue;
    }
    if (f.state !== "PRESENT" && f.state !== "NOT_APPLICABLE" && f.state !== "REDACTED") {
      missing_required.push(name);
    }
  }

  let status: EngineStatus = "COMPLETE";
  if (conflicts.length) status = "CONFLICTED";
  else if (not_loaded.length && missing_required.length) status = "BLOCKED";
  else if (missing_required.length) status = "PARTIAL";

  return { status, fields, receipts, missing_required, conflicts, not_loaded };
}

export const NULL_AXIOMS = {
  "MISSING ≠ UNKNOWN": true,
  "UNKNOWN ≠ NOT_LOADED": true,
  "NOT_LOADED ≠ NULL": true,
  "NULL ≠ FALSE": true,
  "SEARCH_MISS ≠ ABSENCE": true,
  "DELETED→PRESENT": "FORBIDDEN_WITHOUT_NEW_VERSION",
  "CONFLICT→PRESENT": "FORBIDDEN_DIRECT",
  authority_created: false,
} as const;
