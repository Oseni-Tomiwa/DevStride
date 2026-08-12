import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type { Conversation } from "../conversations/types";
import type { FocusArea, FocusAreaDraft, Goal, GoalProgress, GoalType, PlanPreview } from "./types";

export type GoalCreateInput = { title: string; description: string | null; goal_type: GoalType; focus_areas: FocusAreaDraft[] };

export function listGoals(supabase: SupabaseClient) { return createAuthenticatedApiClient(supabase).get<Goal[]>("/api/v1/goals"); }
export function createGoal(supabase: SupabaseClient, input: GoalCreateInput) { return createAuthenticatedApiClient(supabase).post<Goal>("/api/v1/goals", input); }
export function updateGoal(supabase: SupabaseClient, goalId: string, input: Partial<Pick<Goal, "title" | "description" | "goal_type" | "status">>) { return createAuthenticatedApiClient(supabase).patch<Goal>(`/api/v1/goals/${goalId}`, input); }
export function archiveGoal(supabase: SupabaseClient, goalId: string) { return createAuthenticatedApiClient(supabase).delete(`/api/v1/goals/${goalId}`); }
export function previewPlan(supabase: SupabaseClient, input: { title: string; description: string | null; goal_type: GoalType }) { return createAuthenticatedApiClient(supabase).post<PlanPreview>("/api/v1/goals/plan-preview", input); }
export function getGoalProgress(supabase: SupabaseClient, goalId: string) { return createAuthenticatedApiClient(supabase).get<GoalProgress>(`/api/v1/goals/${goalId}/progress`); }
export function updateFocusArea(supabase: SupabaseClient, goalId: string, focusAreaId: string, input: unknown) { return createAuthenticatedApiClient(supabase).patch<FocusArea>(`/api/v1/goals/${goalId}/focus-areas/${focusAreaId}`, input); }
export function archiveFocusArea(supabase: SupabaseClient, goalId: string, focusAreaId: string) { return createAuthenticatedApiClient(supabase).delete(`/api/v1/goals/${goalId}/focus-areas/${focusAreaId}`); }
export function reorderFocusAreas(supabase: SupabaseClient, goalId: string, focusAreaIds: string[]) { return createAuthenticatedApiClient(supabase).put<FocusArea[]>(`/api/v1/goals/${goalId}/focus-areas/order`, { focus_area_ids: focusAreaIds }); }
export function launchFocusAreaPractice(supabase: SupabaseClient, goalId: string, focusAreaId: string) { return createAuthenticatedApiClient(supabase).post<Conversation>(`/api/v1/goals/${goalId}/focus-areas/${focusAreaId}/practice`, {}); }
