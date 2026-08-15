import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/live-video");
});

test("starts Video Interview with a local muted preview and existing realtime engine", async ({ page }) => {
  await page.getByRole("button", { name: "Start Video Interview" }).click();
  const preview = page.getByLabel("Your local camera preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty("muted", true);
  await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera on");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("toggles the local camera without interrupting the audio interview", async ({ page }) => {
  await page.getByRole("button", { name: "Start Video Interview" }).click();
  const cameraStatus = page.locator(".video-interview-preview-card .status-pill");
  const realtimeStatus = page.locator(".live-spike .status-pill");
  await expect(realtimeStatus).toHaveText("Connected");
  await page.getByRole("button", { name: "Turn camera off" }).click();
  await expect(cameraStatus).toHaveText("Camera off");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(cameraStatus).toHaveText("Camera on");
  await expect(realtimeStatus).toHaveText("Connected");
});

test("camera denial falls back to an explicit audio-only session", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __devstrideDenyCamera?: boolean }).__devstrideDenyCamera = true;
  });
  await page.reload();
  await page.getByRole("button", { name: "Start Video Interview" }).click();
  await expect(page.getByText(/microphone and realtime interview are still active/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});
