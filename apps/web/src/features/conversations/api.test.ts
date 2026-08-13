import { beforeEach, describe, expect, it, vi } from "vitest";

import { connectRealtimeSession } from "./api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("realtime conversation API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the application/sdp response body once as raw text", async () => {
    const answerSdp = "v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\na=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n";
    const text = vi.fn().mockResolvedValue(answerSdp);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/sdp; charset=utf-8" }),
      text,
    });
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-access-token" } }, error: null }),
      },
    };

    const result = await connectRealtimeSession(supabase as never, "conversation-id", "v=0\r\no=- offer");

    expect(result).toEqual({
      sdp: answerSdp,
      status: 201,
      contentType: "application/sdp; charset=utf-8",
    });
    expect(text).toHaveBeenCalledTimes(1);
    expect(result.sdp).toContain("a=ice-pwd:");
    expect(result.sdp).not.toContain("a=ice-pwd\\:");
    expect(result.sdp).not.toMatch(/^"|"$/);
  });
});
