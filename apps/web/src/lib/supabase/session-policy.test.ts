import { describe, expect, it } from "vitest";

import {
  ABSOLUTE_SESSION_TIMEOUT_SECONDS,
  INACTIVITY_TIMEOUT_SECONDS,
  createSessionPolicyCookie,
  readSessionPolicy,
} from "./session-policy";

describe("session policy", () => {
  it("accepts active signed policy metadata", async () => {
    const now = 1_000_000;
    const cookie = await createSessionPolicyCookie(now);

    expect(await readSessionPolicy(cookie ?? undefined, now + 60)).toMatchObject({ status: "active" });
  });

  it("rejects policy metadata after inactivity", async () => {
    const now = 1_000_000;
    const cookie = await createSessionPolicyCookie(now);

    expect(await readSessionPolicy(cookie ?? undefined, now + INACTIVITY_TIMEOUT_SECONDS)).toEqual({ status: "inactive" });
  });

  it("rejects policy metadata after the absolute lifetime", async () => {
    const now = 1_000_000;
    const cookie = await createSessionPolicyCookie(now);

    expect(await readSessionPolicy(cookie ?? undefined, now + ABSOLUTE_SESSION_TIMEOUT_SECONDS)).toEqual({ status: "absolute" });
  });

  it("rejects tampered metadata", async () => {
    const cookie = await createSessionPolicyCookie(1_000_000);

    expect(await readSessionPolicy(`${cookie}x`, 1_000_001)).toEqual({ status: "invalid" });
  });
});
