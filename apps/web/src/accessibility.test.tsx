import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AppShell } from "./components/app-shell";
import { AccountSettings } from "./features/account/components/account-settings";
import { AuthForm } from "./features/auth/components/auth-form";
import { ConversationDetail } from "./features/conversations/components/conversation-detail";
import { LiveInterviewSpike } from "./features/conversations/components/live-interview-spike";
import { GoalManager } from "./features/goals/components/goal-manager";
import { ProfileForm } from "./features/profile/components/profile-form";
import { ProgressOverview } from "./features/progress/components/progress-overview";
import type { ProgressSummary } from "./features/progress/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("./features/conversations/api", () => ({
  createConversationSummary: vi.fn(),
  getConversationSummary: vi.fn(),
  getRealtimeAnalytics: vi.fn(),
  retryConversationMessage: vi.fn(),
  startInterview: vi.fn(),
  startTeam: vi.fn(),
  streamConversation: vi.fn(),
}));

const emptyProgress = {
  total_sessions: 0,
  mentor_sessions: 0,
  interview_sessions: 0,
  general_sessions: 0,
  team_sessions: 0,
  recent_sessions: [],
  activity: { practiced_sessions: 0, completed_sessions: 0, user_turns: 0, practiced_sessions_last_30_days: 0, mode_breakdown: { general: 0, mentor: 0, interview: 0, team: 0 } },
  continue_practice: null,
  current_focus: null,
  recent_strength: null,
  recent_weakness: null,
  recurring_strengths: [],
  recurring_weaknesses: [],
  rating_history: [],
  recommendation: { activity: "mentor", title: "Start with Mentor practice", reason: "Build a focused practice record.", evidence: [], action: { kind: "start_practice", mode: "mentor", conversation_id: null, goal_id: null, focus_area_id: null, interview_type: null, interview_focus: null, team_scenario: null, team_difficulty: null } },
} as unknown as ProgressSummary;

const conversation = { id: "conversation-1", title: "Practice", mode: "general", persona: null, status: "active", metadata: {}, created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T10:00:00Z" } as never;

afterEach(() => cleanup());
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterAll(() => vi.restoreAllMocks());

async function expectAccessible(ui: ReactElement) {
  const { container } = render(ui);
  const results = await axe.run(container);
  expect(results.violations).toHaveLength(0);
}

describe("representative application accessibility", () => {
  it("keeps the auth surface accessible", async () => expectAccessible(<AuthForm mode="login" />));
  it("keeps the authenticated shell and dashboard surface accessible", async () => expectAccessible(<AppShell current="dashboard"><h1>Dashboard</h1><p>Practice summary</p></AppShell>));
  it("keeps Goals accessible", async () => expectAccessible(<GoalManager initialGoals={[]} initialProgress={null} />));
  it("keeps Progress accessible", async () => expectAccessible(<ProgressOverview summary={emptyProgress} />));
  it("keeps conversation and Live Interview surfaces accessible", async () => {
    await expectAccessible(<ConversationDetail conversation={conversation} initialMessages={[]} />);
    cleanup();
    await expectAccessible(<LiveInterviewSpike conversationId="conversation-1" interviewType="technical" interviewFocus={null} />);
  });
  it("keeps Account and Profile forms accessible", async () => {
    await expectAccessible(<AccountSettings email="ada@example.com" emailConfirmedAt="2026-08-01T10:00:00Z" createdAt="2026-08-01T10:00:00Z" />);
    cleanup();
    await expectAccessible(<ProfileForm mode="edit" />);
  });
});
