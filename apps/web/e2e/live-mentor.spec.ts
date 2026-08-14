import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/live-mentor");
});

test("connects Live Mentor, persists finalized turns, and ends safely", async ({ page }) => {
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Emit transcript" }).click();
  await expect(page.getByText("My answer")).toBeVisible();
  await expect(page.getByText("Good answer")).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).toBe("true");
});

test("reconnects Live Mentor without finalizing", async ({ page }) => {
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare network retry" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Reconnecting");
  await expect(page.getByRole("status")).toHaveText("Connected", { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).not.toBe("true");
});

test("refresh does not send a duplicate Live Mentor greeting", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Emit transcript" }).click();
  await expect(page.getByText("My answer")).toBeVisible();
  const kickoffCount = await page.evaluate(() => localStorage.getItem("devstride-e2e-kickoff-count"));
  await page.reload();
  await expect(page.getByText("My answer")).toBeVisible();
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-kickoff-count"))).toBe(kickoffCount);
});

test("stops retrying after Live Mentor auth expiry", async ({ page }) => {
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare auth expiry" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Authentication is required to start Live Mentor.", { timeout: 10_000 });
});

test("reports microphone denial without finalizing Live Mentor", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __devstrideDenyMicrophone: boolean }).__devstrideDenyMicrophone = true;
  });
  await page.reload();
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Microphone access was denied. Allow microphone access or use Text Mentor instead.");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).not.toBe("true");
});

test("explicit Live Mentor end cancels reconnect", async ({ page }) => {
  await page.getByRole("button", { name: "Start Live Mentor" }).click();
  await expect(page.getByRole("status")).toHaveText("Connected");
  await page.getByRole("button", { name: "Prepare permanent failure" }).click();
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Reconnecting");
  await page.getByRole("button", { name: "End session" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("devstride-e2e-ended"))).toBe("true");
});
