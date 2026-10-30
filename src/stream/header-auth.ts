export interface HeaderAuthProof {
  decoded: boolean;
  structureValid: boolean;
  authenticated: false;
  reason: string;
  transaction: string | null;
  network: string | null;
  success: boolean | null;
}

function decode(header: string): unknown {
  const pad = header.length % 4 === 0 ? header : header + "=".repeat(4 - (header.length % 4));
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
}

export function proveHeader(header: unknown, expectedNetwork: string): HeaderAuthProof {
  if (typeof header !== "string") {
    return {
      decoded: false,
      structureValid: false,
      authenticated: false,
      reason: "header is not a string; cannot authenticate",
      transaction: null,
      network: null,
      success: null,
    };
  }
  try {
    const parsed = decode(header) as { success?: boolean; transaction?: string; network?: string };
    const structureValid = typeof parsed.success === "boolean" && typeof parsed.network === "string";
    const networkMatch = parsed.network === expectedNetwork;
    return {
      decoded: true,
      structureValid: structureValid && networkMatch,
      authenticated: false,
      reason: "Decoded structure only. No independent facilitator or chain verification. Header is not authenticated.",
      transaction: typeof parsed.transaction === "string" ? parsed.transaction : null,
      network: typeof parsed.network === "string" ? parsed.network : null,
      success: typeof parsed.success === "boolean" ? parsed.success : null,
    };
  } catch {
    return {
      decoded: false,
      structureValid: false,
      authenticated: false,
      reason: "header did not decode as base64 JSON",
      transaction: null,
      network: null,
      success: null,
    };
  }
}
