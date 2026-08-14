import { notFound } from "next/navigation";

import { LiveInterviewE2EHarness } from "../../../features/conversations/components/live-interview-e2e-harness";

export const dynamic = "force-dynamic";

export default function LiveMentorE2EPage() {
  if (process.env.E2E_TEST !== "true") notFound();
  return <LiveInterviewE2EHarness practiceMode="mentor" />;
}
