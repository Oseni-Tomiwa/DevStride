import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/live-interview");
});

test("completes a deterministic live interview and finalizes once", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Emit transcript" }).click();
  await expect(page.getByText("My answer")).toBeVisible();
  await expect(page.getByText("Good answer")).toBeVisible();
  await page.getByRole("button", { name: "End interview" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).toBe("true");
});

test("reconnects after a temporary network failure", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare network retry" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Reconnecting");
  await expect(page.getByRole("status")).toHaveText("Connected", { timeout: 10_000 });
});

test("refresh preserves the transcript without starting a duplicate kickoff", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Emit transcript" }).click();
  await expect(page.getByText("My answer")).toBeVisible();
  const kickoffCount = await page.evaluate(() => localStorage.getItem("devstride-e2e-kickoff-count"));
  await page.reload();
  await expect(page.getByText("My answer")).toBeVisible();
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-kickoff-count"))).toBe(kickoffCount);
});

test("blocks duplicate browser starts while negotiation is active", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const start = page.getByRole("button", { name: "Start live interview" });
  await start.dblclick();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-connect-count"))).toBe("1");
  await expect(page.getByRole("status")).not.toHaveText("Error");
});

test("stops reconnecting after authentication expiry", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare auth expiry" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Authentication is required to start Live Interview.", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("reports a permanent reconnect failure without finalizing", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare permanent failure" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Live Interview could not reconnect. You can try again manually.", { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).not.toBe("true");
});

test("explicit end during reconnect cancels retries and finalizes once", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare permanent failure" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Reconnecting");
  await page.getByRole("button", { name: "End interview" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).toBe("true");
  const attemptsAfterEnd = await page.evaluate(() => localStorage.getItem("devstride-e2e-connect-count"));
  await page.waitForTimeout(2500);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-connect-count"))).toBe(attemptsAfterEnd);
});

test("does not request or finalize when microphone permission is denied", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __devstrideDenyMicrophone: boolean }).__devstrideDenyMicrophone = true;
  });
  await page.reload();
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Microphone access was denied. Allow microphone access or use Text Interview instead.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("reports microphone/device loss without finalizing", async ({ page }) => {
  await page.getByRole("button", { name: "Start live interview" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Simulate microphone loss" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Your microphone became unavailable. Check the device and try again.");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).not.toBe("true");
});
