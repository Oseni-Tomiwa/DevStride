"use client";

import { useEffect, useRef, useState } from "react";

import { LiveInterviewSpike, type LiveInterviewTestApi } from "./live-interview-spike";
import type { RealtimeConnection } from "../realtime-client";

type VideoInterviewProps = {
  conversationId: string;
  interviewType?: string;
  interviewFocus?: string | null;
  initialMessages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  testApi?: LiveInterviewTestApi;
};

type CameraState = "off" | "on" | "unavailable" | "switching";
type MicrophoneState = "on" | "switching" | "unavailable";
type DeviceOption = { id: string; label: string };

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function attachPreview(video: HTMLVideoElement | null, nextStream: MediaStream | null) {
  if (!video) return;
  try { video.srcObject = nextStream; } catch { /* Browser-specific media attachment can fail safely. */ }
}

function deviceLabel(device: MediaDeviceInfo, index: number, kind: "camera" | "microphone") {
  return device.label || `${kind === "camera" ? "Camera" : "Microphone"} ${index + 1}`;
}

function removeAndStopTrack(stream: MediaStream, track: MediaStreamTrack) {
  try { stream.removeTrack?.(track); } finally { track.stop(); }
}

export function VideoInterview({ conversationId, interviewType, interviewFocus, initialMessages = [], testApi }: VideoInterviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const removeCameraTrackListenerRef = useRef<(() => void) | null>(null);
  const removeMicrophoneTrackListenerRef = useRef<(() => void) | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("off");
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("on");
  const [audioOnly, setAudioOnly] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<DeviceOption[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<DeviceOption[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    streamRef.current = stream;
    attachPreview(videoRef.current, stream);
  }, [stream]);

  useEffect(() => () => {
    connectionRef.current = null;
    removeCameraTrackListenerRef.current?.();
    removeMicrophoneTrackListenerRef.current?.();
    stopTracks(streamRef.current);
    streamRef.current = null;
  }, []);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ id: device.deviceId, label: deviceLabel(device, index, "camera") }));
      const microphones = devices.filter((device) => device.kind === "audioinput").map((device, index) => ({ id: device.deviceId, label: deviceLabel(device, index, "microphone") }));
      setCameraDevices(cameras);
      setMicrophoneDevices(microphones);
    } catch { /* Enumeration is optional and browser-dependent. */ }
  }

  function watchCameraTrack(nextStream: MediaStream) {
    removeCameraTrackListenerRef.current?.();
    const track = nextStream.getVideoTracks().find((candidate) => candidate.readyState !== "ended");
    if (!track) { setCameraState("unavailable"); return; }
    const handleEnded = () => setCameraState("unavailable");
    track.addEventListener("ended", handleEnded, { once: true });
    removeCameraTrackListenerRef.current = () => track.removeEventListener("ended", handleEnded);
    setCameraState(track.enabled ? "on" : "off");
  }

  function watchMicrophoneTrack(track: MediaStreamTrack) {
    removeMicrophoneTrackListenerRef.current?.();
    const handleEnded = () => {
      setMicrophoneState("unavailable");
      setError("Your microphone became unavailable. Choose another microphone or retry the microphone.");
    };
    track.addEventListener("ended", handleEnded, { once: true });
    removeMicrophoneTrackListenerRef.current = () => track.removeEventListener("ended", handleEnded);
  }

  async function prepareMedia() {
    setIsRequesting(true);
    setError(null);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setAudioOnly(false);
      watchCameraTrack(nextStream);
      const microphone = nextStream.getAudioTracks()[0];
      if (microphone) { setMicrophoneState("on"); watchMicrophoneTrack(microphone); }
      streamRef.current = nextStream;
      setStream(nextStream);
      await refreshDevices();
    } catch (cameraCause) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setAudioOnly(true);
        setCameraState("unavailable");
        const microphone = audioStream.getAudioTracks()[0];
        if (microphone) watchMicrophoneTrack(microphone);
        streamRef.current = audioStream;
        setStream(audioStream);
        setError("Camera access was unavailable. Continue audio-only or retry the camera.");
        await refreshDevices();
      } catch (microphoneCause) {
        const name = microphoneCause instanceof DOMException ? microphoneCause.name : "";
        setMicrophoneState("unavailable");
        setError(name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access to continue." : "Microphone access is unavailable. Check your device and try again.");
      }
      void cameraCause;
    } finally { setIsRequesting(false); }
  }

  function resetMedia() {
    removeCameraTrackListenerRef.current?.();
    removeMicrophoneTrackListenerRef.current?.();
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsInterviewStarted(false);
    setAudioOnly(false);
    setCameraState("off");
    setMicrophoneState("on");
    setCameraDevices([]);
    setMicrophoneDevices([]);
    setError(null);
  }

  function startInterview() {
    const microphone = streamRef.current?.getAudioTracks().find((track) => track.readyState === "live");
    if (!microphone) {
      setMicrophoneState("unavailable");
      setError("A working microphone is required to start the Interview. Retry device setup and try again.");
      return;
    }
    setError(null);
    setIsInterviewStarted(true);
  }

  async function replaceCamera(nextDeviceId: string) {
    setCameraDeviceId(nextDeviceId);
    const current = streamRef.current;
    if (!current) return;
    setCameraState("switching");
    let replacement: MediaStream | null = null;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({ video: nextDeviceId ? { deviceId: { exact: nextDeviceId } } : true });
      const nextTrack = replacement.getVideoTracks()[0];
      if (!nextTrack) throw new Error("camera_unavailable");
      const oldTrack = current.getVideoTracks()[0];
      current.addTrack(nextTrack);
      if (oldTrack) { removeCameraTrackListenerRef.current?.(); removeAndStopTrack(current, oldTrack); }
      watchCameraTrack(current);
      attachPreview(videoRef.current, current);
      setAudioOnly(false);
      setError(null);
    } catch {
      if (replacement) stopTracks(replacement);
      setCameraState(current.getVideoTracks().some((track) => track.readyState === "live") ? "on" : "unavailable");
      setError("Camera switching failed. Your current camera is still in use.");
    }
  }

  async function retryCamera() { await replaceCamera(cameraDeviceId); }

  async function replaceMicrophone(nextDeviceId: string) {
    setMicrophoneDeviceId(nextDeviceId);
    const current = streamRef.current;
    if (!current) return;
    setMicrophoneState("switching");
    let replacement: MediaStream | null = null;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({ audio: nextDeviceId ? { deviceId: { exact: nextDeviceId } } : true });
      const nextTrack = replacement.getAudioTracks()[0];
      if (!nextTrack) throw new Error("microphone_unavailable");
      const oldTrack = current.getAudioTracks()[0];
      if (connectionRef.current) await connectionRef.current.replaceMicrophoneTrack(nextTrack);
      current.addTrack(nextTrack);
      if (oldTrack) { removeMicrophoneTrackListenerRef.current?.(); removeAndStopTrack(current, oldTrack); }
      watchMicrophoneTrack(nextTrack);
      setMicrophoneState("on");
      setError(null);
    } catch {
      if (replacement) stopTracks(replacement);
      setMicrophoneState(current.getAudioTracks().some((track) => track.readyState === "live") ? "on" : "unavailable");
      setError("Microphone switching failed. Your current microphone is still in use.");
    }
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks().find((candidate) => candidate.readyState !== "ended");
    if (!track || track.readyState === "ended") { void retryCamera(); return; }
    track.enabled = !track.enabled;
    setCameraState(track.enabled ? "on" : "off");
  }

  if (!stream) return (
    <section className="video-interview-shell video-interview-setup" aria-labelledby="video-interview-title">
      <div className="video-interview-setup-heading">
        <p className="eyebrow">Video Interview · Setup</p>
        <h1 id="video-interview-title">Prepare your interview room</h1>
        <p className="muted">Check your camera and microphone before you begin. The realtime Interview will not start until you choose Start Interview.</p>
      </div>
      <div className="video-interview-privacy" role="note">
        <strong>Your camera stays on this device.</strong>
        <span>DevStride does not send, record, or store camera video in this version. The AI interviewer uses the existing audio experience.</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" onClick={() => void prepareMedia()} disabled={isRequesting}>{isRequesting ? "Checking devices…" : "Set up camera and microphone"}</button>
    </section>
  );

  return (
    <section className={isInterviewStarted ? "video-interview-shell video-interview-active" : "video-interview-shell video-interview-setup"} aria-labelledby="video-interview-title">
      <div className="video-interview-preview-card">
        <div className="video-interview-preview-heading"><div><p className="eyebrow">Video Interview · {isInterviewStarted ? "Interview" : "Setup"}</p><h1 id="video-interview-title">{isInterviewStarted ? "Your interview room" : "Check your setup"}</h1></div><span className="status-pill" role="status">{cameraState === "on" ? "Camera ready" : cameraState === "switching" ? "Camera switching" : cameraState === "unavailable" ? "Camera unavailable" : "Camera off"}</span></div>
        <div className="video-interview-preview-wrap"><video ref={videoRef} autoPlay muted playsInline aria-label="Your local camera preview" />{cameraState !== "on" && <p className="video-interview-camera-off">{cameraState === "unavailable" ? "Camera unavailable · audio continues" : "Camera off · audio continues"}</p>}</div>
        {audioOnly && <p className="field-hint">Camera is unavailable. The Interview can continue with audio.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {!isInterviewStarted && <div className="video-interview-readiness" aria-label="Device readiness"><span className={microphoneState === "on" ? "status-pill status-pill-success" : "status-pill status-pill-error"}>Microphone {microphoneState === "on" ? "ready" : microphoneState === "switching" ? "switching" : "unavailable"}</span><span className="status-pill">{audioOnly ? "Audio-only" : cameraState === "on" ? "Camera ready" : "Camera unavailable"}</span></div>}
        {!isInterviewStarted ? <div className="video-interview-setup-actions"><button type="button" onClick={startInterview} disabled={microphoneState !== "on"}>Start Interview</button><button type="button" className="button-secondary" onClick={resetMedia}>Retry device setup</button></div> : <div className="video-interview-active-tools" aria-label="Video settings"><button type="button" className="button-secondary" onClick={toggleCamera} disabled={cameraState === "switching"}>{cameraState === "on" ? "Turn camera off" : "Turn camera on"}</button>{cameraState === "unavailable" && <button type="button" className="button-secondary" onClick={() => void retryCamera()}>Retry camera</button>}<details className="video-device-settings"><summary>Device settings</summary><div className="video-interview-controls">{cameraDevices.length > 0 && <label className="video-device-select">Camera<select value={cameraDeviceId} onChange={(event) => void replaceCamera(event.target.value)} disabled={cameraState === "switching"}><option value="">Default camera</option>{cameraDevices.map((device) => <option key={device.id || device.label} value={device.id}>{device.label}</option>)}</select></label>}{microphoneDevices.length > 0 && <label className="video-device-select">Microphone<select value={microphoneDeviceId} onChange={(event) => void replaceMicrophone(event.target.value)} disabled={microphoneState === "switching"}><option value="">Default microphone</option>{microphoneDevices.map((device) => <option key={device.id || device.label} value={device.id}>{device.label}</option>)}</select></label>}{microphoneState !== "on" && <span className="field-hint">{microphoneState === "switching" ? "Switching microphone…" : "Microphone unavailable. Retry or choose another device."}</span>}</div></details></div>}
      </div>
      {isInterviewStarted && <LiveInterviewSpike conversationId={conversationId} interviewType={interviewType} interviewFocus={interviewFocus} initialMessages={initialMessages} testApi={testApi} mediaStream={stream} startOnMount onConnectionChange={(connection) => { connectionRef.current = connection; }} />}
    </section>
  );
}
