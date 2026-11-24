import { analyze, type Level } from "@ojolink/core";

/** A link whose verdict is known, used to confirm the engine works inside the extension. */
export const SELF_CHECK_LINK = "https://bcp.com.bo.verifica.net/";

export function selfCheck(): Level | "not-analyzed" {
  const result = analyze(SELF_CHECK_LINK);
  return result.analyzed ? result.level : "not-analyzed";
}

export function describeSelfCheck(version: string): string {
  return `OjoLink ${version}: engine ready, self-check ${selfCheck()}`;
}
