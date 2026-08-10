export type MemoryCategory = "goal" | "preference" | "project" | "skill" | "weakness" | "achievement";

export type Memory = {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  confidence: number;
  source_type: string;
  source_id: string | null;
  status: "active" | "archived";
  last_reinforced_at: string | null;
  reinforcement_count: number;
  created_at: string;
  updated_at: string;
};

export type MemoryCreateInput = { category: MemoryCategory; content: string };
export type MemoryPatchInput = Partial<Pick<Memory, "category" | "content" | "importance">>;
