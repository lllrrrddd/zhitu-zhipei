// SPDX-License-Identifier: Apache-2.0
/**
 * Interview voice: read the interviewer's question aloud, and let the user answer by speaking.
 *
 * The two capabilities have completely different availability and must be treated separately:
 *
 * - TTS uses `speechSynthesis`: works offline, Windows ships zh voices, so this is the stable base.
 * - STT uses `webkitSpeechRecognition`: Chrome/Edge only, and it uploads audio for cloud
 *   recognition, which often fails on restricted networks. Typing always stays available;
 *   when STT is missing or fails we hide the button or explain why, never block the answer.
 *
 * Two rules:/n * 1. Transcripts are appended to the box, never auto-submitted (recognition errors are normal);
 * 2. Speech can be interrupted at any time (next question, leaving the room), no queueing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API is not in lib.dom; declare only what we use instead of sprinkling any.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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

/** Dictation: emit final results only; interim ones would make the box flicker. */
export function useDictation(onFinal: (text: string) => void) {
  const Ctor = recognitionCtor();
  const supported = Ctor !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Ctor) {
      setError("unsupported");
      return;
    }
    setError("");
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = false; // one sentence per tap: continuous mode turns noise into text
    rec.interimResults = false;
    rec.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) text += result[0]?.transcript ?? "";
      }
      if (text.trim()) onFinal(text.trim());
    };
    rec.onerror = (event) => {
      setError(event.error ?? "unknown");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // Double-click throws InvalidStateError; treat it as "already listening".
      setListening(false);
    }
  }, [Ctor, onFinal]);

  useEffect(() => stop, [stop]);

  return { supported, listening, error, start, stop };
}
