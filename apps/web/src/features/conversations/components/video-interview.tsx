"use client";

import { useEffect, useRef, useState } from "react";

import { LiveInterviewSpike, type LiveInterviewTestApi } from "./live-interview-spike";

type VideoInterviewProps = {
  conversationId: string;
  interviewType?: string;
  interviewFocus?: string | null;
  initialMessages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  testApi?: LiveInterviewTestApi;
};

type CameraState = "off" | "on" | "unavailable";

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function attachPreview(video: HTMLVideoElement | null, nextStream: MediaStream | null) {
  if (!video) return;
  try {
    video.srcObject = nextStream;
  } catch {
    // A browser/device-specific media object may not be attachable yet.
  }
}

export function VideoInterview({ conversationId, interviewType, interviewFocus, initialMessages = [], testApi }: VideoInterviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("off");
  const [audioOnly, setAudioOnly] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    streamRef.current = stream;
    attachPreview(videoRef.current, stream);
    return () => {
      if (streamRef.current === stream) {
        stopTracks(stream);
        streamRef.current = null;
      }
    };
  }, [stream]);

  function watchCameraTrack(nextStream: MediaStream) {
    const track = nextStream.getVideoTracks().find((candidate) => candidate.readyState !== "ended");
    if (!track) {
      setCameraState("unavailable");
      return;
    }
    track.addEventListener("ended", () => setCameraState("unavailable"), { once: true });
    setCameraState(track.enabled ? "on" : "off");
  }

  async function startVideoInterview() {
    setIsRequesting(true);
    setError(null);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setAudioOnly(false);
      watchCameraTrack(nextStream);
      setStream(nextStream);
    } catch (cameraCause) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setAudioOnly(true);
        setCameraState("unavailable");
        setError("Camera access was unavailable. Continue audio-only or retry the camera.");
        setStream(audioStream);
      } catch (microphoneCause) {
        const name = microphoneCause instanceof DOMException ? microphoneCause.name : "";
        setError(name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access to continue." : "Microphone access is unavailable. Check your device and try again.");
      }
      void cameraCause;
    } finally {
      setIsRequesting(false);
    }
  }

  async function retryCamera() {
    const current = streamRef.current;
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = cameraStream.getVideoTracks()[0];
      if (!track || !current) {
        stopTracks(cameraStream);
        throw new Error("camera_unavailable");
      }
      current.addTrack(track);
      setAudioOnly(false);
      watchCameraTrack(current);
      setError(null);
      attachPreview(videoRef.current, current);
    } catch {
      setCameraState("unavailable");
      setError("Camera access is still unavailable. You can continue audio-only or try again later.");
    }
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks().find((candidate) => candidate.readyState !== "ended");
    if (!track || track.readyState === "ended") {
      void retryCamera();
      return;
    }
    track.enabled = !track.enabled;
    setCameraState(track.enabled ? "on" : "off");
  }

  if (!stream) {
    return (
      <section className="video-interview-shell" aria-labelledby="video-interview-title">
        <p className="eyebrow">Video Interview</p>
        <h1 id="video-interview-title">Video Interview</h1>
        <p className="muted">Practice with camera and voice. The camera preview stays on this device; it is not sent to OpenAI or stored.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" onClick={() => void startVideoInterview()} disabled={isRequesting}>
          {isRequesting ? "Requesting devices…" : "Start Video Interview"}
        </button>
      </section>
    );
  }

  return (
    <section className="video-interview-shell" aria-labelledby="video-interview-title">
      <div className="video-interview-preview-card">
        <div className="video-interview-preview-heading">
          <div>
            <p className="eyebrow">Video Interview</p>
            <h1 id="video-interview-title">Your interview room</h1>
          </div>
          <span className="status-pill" role="status">{cameraState === "on" ? "Camera on" : "Camera off"}</span>
        </div>
        <div className="video-interview-preview-wrap">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Your local camera preview" />
          {cameraState !== "on" && <p className="video-interview-camera-off">Camera off · audio continues</p>}
        </div>
        <div className="video-interview-controls">
          <button type="button" className="button-secondary" onClick={toggleCamera}>
            {cameraState === "on" ? "Turn camera off" : "Turn camera on"}
          </button>
          {cameraState === "unavailable" && <button type="button" className="button-secondary" onClick={() => void retryCamera()}>Retry camera</button>}
          {audioOnly && <p className="field-hint">Camera is off. Your microphone and realtime interview are still active.</p>}
        </div>
      </div>
      <LiveInterviewSpike
        conversationId={conversationId}
        interviewType={interviewType}
        interviewFocus={interviewFocus}
        initialMessages={initialMessages}
        testApi={testApi}
        mediaStream={stream}
        startOnMount
      />
    </section>
  );
}
