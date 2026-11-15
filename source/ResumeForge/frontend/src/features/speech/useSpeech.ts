// SPDX-License-Identifier: Apache-2.0
/**
 * Interview voice: read the interviewer's question aloud, and let the user answer by speaking.
 *
 * The two capabilities have completely different availability and must be treated separately:
 *
 * - TTS uses `speechSynthesis`: works offline, Windows ships zh voices, so this is the stable base.
 * - STT records here and sends a WAV to our own backend, which runs sherpa-onnx + Paraformer
 *   locally. Audio never leaves the machine and no cloud service is involved, so it works
 *   offline. Typing always stays available; when the model is not installed we say so
 *   instead of showing a button that does nothing.
 *
 * Two rules:/n * 1. Transcripts are appended to the box, never auto-submitted (recognition errors are normal);
 * 2. Speech can be interrupted at any time (next question, leaving the room), no queueing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** TTS capability: when unsupported, `supported` is false and speak() is a no-op. */
export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Voice list loads asynchronously (Windows especially): the first getVoices() is often
  // empty, so pick once now and again on voiceschanged. Prefer a zh voice, otherwise an
  // English voice reads Chinese text and it sounds like noise.
  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      setVoice(
        voices.find((item) => /^zh(-|_)?/i.test(item.lang)) ??
          voices.find((item) => /chinese/i.test(item.name)) ??
          null,
      );
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const body = text.trim();
      if (!body) return;
      // One at a time: cancel the previous utterance so a new question never queues behind it.
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(body);
      utterance.lang = voice?.lang ?? "zh-CN";
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [supported, voice],
  );

  // Stop on unmount: otherwise the voice keeps reading after the user navigates away.
  useEffect(() => stop, [stop]);

  return { supported, speaking, speak, stop };
}

/** Encode mono float32 samples (any rate) as 16-bit PCM WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

export type DictationState = "idle" | "recording" | "transcribing";

/**
 * Local dictation: record with getUserMedia, encode WAV in the page, POST to
 * /api/interview/transcribe. The backend runs an offline Chinese ASR model.
 *
 * No MediaRecorder: it would produce webm/opus which the server cannot decode without
 * ffmpeg. Capturing raw samples with a ScriptProcessor and writing a WAV header is
 * ~30 lines and removes that whole dependency chain.
 */
export function useLocalDictation(onText: (text: string) => void) {
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== "undefined" &&
    "AudioContext" in window;
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState("");
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError("unsupported");
      return;
    }
    setError("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      // Ask for 16 kHz directly; if the browser ignores it the server resamples.
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(channel));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      setState("recording");
    } catch {
      // Permission denied or no microphone: say so instead of silently doing nothing.
      setError("denied");
      cleanup();
      setState("idle");
    }
  }, [cleanup, supported]);

  const stop = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) {
      setState("idle");
      return;
    }
    const rate = ctx.sampleRate;
    const chunks = chunksRef.current;
    cleanup();
    setState("transcribing");
    const total = chunks.reduce((sum, item) => sum + item.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    if (total < rate * 0.3) {
      setError("tooShort");
      setState("idle");
      return;
    }
    try {
      const body = new FormData();
      body.append("audio", encodeWav(merged, rate), "answer.wav");
      const response = await fetch("/api/interview/transcribe", { method: "POST", body });
      if (response.status === 503) {
        setError("unavailable");
        setState("idle");
        return;
      }
      const data = (await response.json().catch(() => null)) as
        | { text?: string; detail?: string }
        | null;
      if (!response.ok) {
        setError(data?.detail ?? "failed");
        setState("idle");
        return;
      }
      const text = (data?.text ?? "").trim();
      if (text) onText(text);
      else setError("empty");
      setState("idle");
    } catch {
      setError("failed");
      setState("idle");
    }
  }, [cleanup, onText]);

  useEffect(() => cleanup, [cleanup]);

  return { supported, state, error, start, stop };
}
