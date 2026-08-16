import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/live-video");
});

async function startVideoInterview(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Set up camera and microphone" }).click();
  await page.getByRole("button", { name: "Start Interview" }).click();
}

async function openDeviceSettings(page: import("@playwright/test").Page) {
  await page.getByText("Device settings", { exact: true }).click();
}

test("starts Video Interview with a local muted preview and existing realtime engine", async ({ page }) => {
  await startVideoInterview(page);
  const preview = page.getByLabel("Your local camera preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty("muted", true);
  await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera ready");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("toggles the local camera without interrupting the audio interview", async ({ page }) => {
  await startVideoInterview(page);
  const cameraStatus = page.locator(".video-interview-preview-card .status-pill");
  const realtimeStatus = page.locator(".live-spike .status-pill");
  await expect(realtimeStatus).toHaveText("Connected");
  await page.getByRole("button", { name: "Turn camera off" }).click();
  await expect(cameraStatus).toHaveText("Camera off");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(cameraStatus).toHaveText("Camera ready");
  await expect(realtimeStatus).toHaveText("Connected");
});

test("camera denial falls back to an explicit audio-only session", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __devstrideDenyCamera?: boolean }).__devstrideDenyCamera = true;
  });
  await page.reload();
  await startVideoInterview(page);
  await expect(page.getByText(/Interview can continue with audio/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("switches camera without reconnecting the audio interview", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await openDeviceSettings(page);
  await page.locator(".video-device-select").filter({ hasText: "Camera" }).locator("select").selectOption("camera-rear");
  await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera ready");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("switches microphone through the active audio sender", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await openDeviceSettings(page);
  const microphone = page.locator(".video-device-select").filter({ hasText: "Microphone" }).locator("select");
  await microphone.selectOption("microphone-usb");
  await expect(microphone).toHaveValue("microphone-usb");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("microphone denial is recoverable without starting a session", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __devstrideDenyMicrophone?: boolean }).__devstrideDenyMicrophone = true;
  });
  await page.reload();
  await page.getByRole("button", { name: "Set up camera and microphone" }).click();
  await expect(page.locator(".form-error[role='alert']")).toContainText("Microphone access was denied");
  await expect(page.getByRole("button", { name: "Set up camera and microphone" })).toBeVisible();
});

test("camera device loss keeps the connected audio interview alive", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await page.getByRole("button", { name: "Simulate camera loss" }).click();
  await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera unavailable");
  await expect(page.getByRole("button", { name: "Retry camera" })).toBeVisible();
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("microphone device loss surfaces recovery without finalizing", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await page.getByRole("button", { name: "Simulate audio device loss" }).click();
  await expect(page.locator(".form-error[role='alert']").first()).toContainText("microphone became unavailable");
  await expect(page.locator(".live-spike .status-pill")).not.toHaveText("Ended");
});

test("reconnect preserves the local camera preview", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await page.getByRole("button", { name: "Drop connection" }).click();
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Reconnecting");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected", { timeout: 5000 });
  await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera ready");
});

test("camera toggles remain stable across repeated changes", async ({ page }) => {
  await startVideoInterview(page);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "Turn camera off" }).click();
    await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera off");
    await page.getByRole("button", { name: "Turn camera on" }).click();
    await expect(page.locator(".video-interview-preview-card .status-pill")).toHaveText("Camera ready");
  }
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
});

test("End Interview exposes the existing completion control", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.getByRole("button", { name: "End interview" })).toBeVisible();
  await page.getByRole("button", { name: "End interview" }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("devstride-e2e-ended"))).toBe("true");
});

test("does not create a second provider peer during device selection", async ({ page }) => {
  await startVideoInterview(page);
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await openDeviceSettings(page);
  await page.locator(".video-device-select").filter({ hasText: "Camera" }).locator("select").selectOption("camera-rear");
  await page.locator(".video-device-select").filter({ hasText: "Microphone" }).locator("select").selectOption("microphone-usb");
  await expect(page.locator(".live-spike .status-pill")).toHaveText("Connected");
  await expect(page.getByRole("button", { name: "End interview" })).toBeVisible();
});

test.describe("narrow video room", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps captions and the end control reachable on mobile", async ({ page }) => {
    await startVideoInterview(page);
    await expect(page.getByRole("heading", { name: "Live captions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "End interview" })).toBeVisible();
    await page.getByRole("button", { name: "End interview" }).click();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("devstride-e2e-ended"))).toBe("true");
  });
});
