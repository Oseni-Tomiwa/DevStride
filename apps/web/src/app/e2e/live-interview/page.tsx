import { notFound } from "next/navigation";

import { LiveInterviewE2EHarness } from "../../../features/conversations/components/live-interview-e2e-harness";

export default function LiveInterviewE2EPage() {
  if (process.env.E2E_TEST !== "true") notFound();
  return <LiveInterviewE2EHarness />;
}
