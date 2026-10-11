import { isMessage, type Message } from "./contracts";

export type SseFrame = {
  event: string;
  data: string;
};

export type ChatSseEvent =
  | { type: "user_message"; message: Message }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_complete"; message: Message }
  | { type: "error"; code: string; message: string }
  | { type: "done" }
  | { type: "unknown"; event: string };

export class SseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseProtocolError";
  }
}

function parseFrame(block: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

export class SseParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";

  push(chunk: Uint8Array): SseFrame[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  finish(): SseFrame[] {
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(atEof: boolean): SseFrame[] {
    const trailingCarriageReturn = !atEof && this.buffer.endsWith("\r");
    const normalizable = trailingCarriageReturn ? this.buffer.slice(0, -1) : this.buffer;
    this.buffer =
      normalizable.replace(/\r\n/g, "\n").replace(/\r/g, "\n") +
      (trailingCarriageReturn ? "\r" : "");
    const frames: SseFrame[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = parseFrame(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      if (frame) {
        frames.push(frame);
      }
      boundary = this.buffer.indexOf("\n\n");
    }
    if (atEof && this.buffer.length > 0) {
      const frame = parseFrame(this.buffer);
      this.buffer = "";
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  }
}

function parseJson(frame: SseFrame): unknown {
  try {
    return JSON.parse(frame.data);
  } catch {
    throw new SseProtocolError(`Invalid JSON for ${frame.event} event.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeChatSseFrame(frame: SseFrame): ChatSseEvent {
  if (![
    "user_message",
    "assistant_delta",
    "assistant_complete",
    "error",
    "done",
  ].includes(frame.event)) {
    return { type: "unknown", event: frame.event };
  }

  const value = parseJson(frame);
  if (frame.event === "user_message") {
    if (!isMessage(value) || value.role !== "user") {
      throw new SseProtocolError("Invalid user_message event payload.");
    }
    return { type: "user_message", message: value };
  }
  if (frame.event === "assistant_complete") {
    if (!isMessage(value) || value.role !== "assistant") {
      throw new SseProtocolError("Invalid assistant_complete event payload.");
    }
    return { type: "assistant_complete", message: value };
  }
  if (frame.event === "assistant_delta") {
    if (!isRecord(value) || typeof value.delta !== "string") {
      throw new SseProtocolError("Invalid assistant_delta event payload.");
    }
    return { type: "assistant_delta", delta: value.delta };
  }
  if (frame.event === "error") {
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") {
      throw new SseProtocolError("Invalid error event payload.");
    }
    return { type: "error", code: value.code, message: value.message };
  }
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    throw new SseProtocolError("Invalid done event payload.");
  }
  return { type: "done" };
}
