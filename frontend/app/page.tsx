"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  useAudioRecorder,
  useMicDevices,
  useSpeechSynthesis,
} from "./_hooks/voice";

const NovaScene = dynamic(
  () => import("./_components/NovaScene").then((m) => m.NovaScene),
  { ssr: false, loading: () => null },
);

import { BgGrid, HudFrame, Ripple, ScanLine } from "./_components/HudFx";

type OrbSpeaker = "jarvis" | "pro" | "con" | "mediator";

type Speaker = "jarvis" | "pro" | "con" | "mediator" | "system" | "user";

type Message = {
  speaker: Speaker;
  text: string;
  kind?: "token" | "info";
};

const SPEAKER_META: Record<Speaker, { label: string; accent: string; bubble: string }> = {
  jarvis: {
    label: "Nova",
    accent: "text-cyan-300",
    bubble: "bg-zinc-900/80 border border-cyan-900/40",
  },
  pro: {
    label: "Sol",
    accent: "text-emerald-300",
    bubble: "bg-zinc-900/80 border border-emerald-900/40",
  },
  con: {
    label: "Umbra",
    accent: "text-rose-300",
    bubble: "bg-zinc-900/80 border border-rose-900/40",
  },
  mediator: {
    label: "Polaris",
    accent: "text-amber-300",
    bubble: "bg-zinc-900/80 border border-amber-900/40",
  },
  system: {
    label: "System",
    accent: "text-zinc-500",
    bubble: "bg-transparent",
  },
  user: {
    label: "Bạn",
    accent: "text-zinc-300",
    bubble: "bg-zinc-800 border border-zinc-700",
  },
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [voiceOutOn, setVoiceOutOn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<OrbSpeaker | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSpeakerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tts = useSpeechSynthesis("vi-VN");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let sid = localStorage.getItem("arguenet_session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("arguenet_session_id", sid);
    }
    setSessionId(sid);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || busy || !sessionId) return;

      tts.cancel();
      setMessages((m) => [...m, { speaker: "user", text }]);
      setInput("");
      setBusy(true);

      const speakOn = voiceOutOn;
      let ttsSpeaker: string | null = null;
      let ttsBuffer = "";
      const flushTts = () => {
        if (
          speakOn &&
          ttsSpeaker &&
          ttsSpeaker !== "system" &&
          ttsSpeaker !== "user" &&
          ttsBuffer.trim()
        ) {
          tts.speak(ttsBuffer);
        }
        ttsBuffer = "";
      };

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: text }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            if (!block.trim()) continue;
            let eventName = "message";
            let dataLine = "";
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
            }
            if (!dataLine) continue;

            if (eventName === "done") {
              flushTts();
              if (activeSpeakerTimer.current)
                clearTimeout(activeSpeakerTimer.current);
              activeSpeakerTimer.current = setTimeout(
                () => setActiveSpeaker(null),
                1500,
              );
              continue;
            }
            if (eventName === "error") {
              try {
                const err = JSON.parse(dataLine);
                appendInfo(setMessages, `Lỗi: ${err.error}`);
              } catch {
                appendInfo(setMessages, "Lỗi không xác định.");
              }
              continue;
            }

            try {
              const ev = JSON.parse(dataLine) as Message;
              if (ev.kind === "info") {
                appendInfo(setMessages, ev.text);
                continue;
              }
              if (ev.speaker !== ttsSpeaker) {
                flushTts();
                ttsSpeaker = ev.speaker;
              }
              ttsBuffer += ev.text;
              if (
                ev.speaker === "jarvis" ||
                ev.speaker === "pro" ||
                ev.speaker === "con" ||
                ev.speaker === "mediator"
              ) {
                setActiveSpeaker(ev.speaker as OrbSpeaker);
              }
              appendToken(setMessages, ev);
            } catch {
              // ignore malformed event
            }
          }
        }
        flushTts();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        appendInfo(setMessages, `Lỗi mạng: ${msg}`);
      } finally {
        setBusy(false);
        if (activeSpeakerTimer.current)
          clearTimeout(activeSpeakerTimer.current);
        activeSpeakerTimer.current = setTimeout(
          () => setActiveSpeaker(null),
          1500,
        );
      }
    },
    [input, busy, sessionId, voiceOutOn, tts],
  );

  const reset = useCallback(async () => {
    if (!sessionId) return;
    tts.cancel();
    setActiveSpeaker(null);
    try {
      await fetch(`${BACKEND_URL}/sessions/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      /* ignore */
    }
    setMessages([]);
  }, [sessionId, tts]);

  const micDevices = useMicDevices();
  const recorder = useAudioRecorder({
    deviceId: micDevices.selected,
    maxDurationMs: 30000,
  });
  const [transcribing, setTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const startMic = useCallback(async () => {
    setSttError(null);
    if (!micDevices.permissionGranted) {
      await micDevices.requestPermission();
    }
    await recorder.start();
  }, [recorder, micDevices]);

  const stopMicAndTranscribe = useCallback(async () => {
    const blob = await recorder.stop();
    if (!blob) {
      setSttError("Không thu được audio.");
      return;
    }
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");
      const res = await fetch(`${BACKEND_URL}/transcribe`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${detail}`);
      }
      const data = (await res.json()) as { text: string };
      const text = (data.text ?? "").trim();
      if (!text) {
        setSttError("Không nhận diện được giọng nói.");
      } else {
        setInput(text);
        send(text);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSttError(`Lỗi transcribe: ${msg}`);
    } finally {
      setTranscribing(false);
    }
  }, [recorder, send]);

  const micError = sttError ?? recorder.error;
  const micBusy = transcribing;

  const toggleVoiceOut = useCallback(() => {
    setVoiceOutOn((on) => {
      if (on) tts.cancel();
      return !on;
    });
  }, [tts]);

  const isActive = !!activeSpeaker || busy;

  return (
    <>
      <NovaScene activeSpeaker={activeSpeaker} />
      <BgGrid />
      <Ripple active={isActive} />
      <ScanLine active={isActive} />

      <div className="fixed inset-0 z-10 flex flex-col pointer-events-none">
        {/* TOP BAR */}
        <header className="pointer-events-auto h-14 px-6 flex items-center justify-between border-b border-cyan-900/40 bg-zinc-950/35 backdrop-blur-md">
          <div className="flex items-baseline gap-3">
            <h1 className="text-sm font-semibold tracking-[0.3em] text-cyan-200">
              ARGUENET
            </h1>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${
                  activeSpeaker ? "bg-cyan-300 animate-pulse" : "bg-zinc-600"
                }`}
              />
              {activeSpeaker ? SPEAKER_META[activeSpeaker].label : "idle"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {mounted && (
              <>
                {micDevices.devices.length > 1 && (
                  <select
                    value={micDevices.selected}
                    onChange={(e) => micDevices.setSelected(e.target.value)}
                    disabled={busy || recorder.recording || micBusy}
                    title="Chọn microphone"
                    className="text-xs bg-zinc-900/60 border border-cyan-900/40 rounded-md px-2 py-1.5 max-w-[160px] truncate"
                  >
                    <option value="">Mic mặc định</option>
                    {micDevices.devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={
                    recorder.recording ? stopMicAndTranscribe : startMic
                  }
                  disabled={busy || micBusy || !recorder.supported}
                  title={
                    !recorder.supported
                      ? "Browser không hỗ trợ MediaRecorder"
                      : micBusy
                        ? "Đang chuyển giọng nói thành chữ…"
                        : recorder.recording
                          ? "Đang ghi — bấm để dừng và gửi"
                          : "Bấm để ghi giọng nói"
                  }
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    recorder.recording
                      ? "border-rose-500 bg-rose-500/15 text-rose-200 animate-pulse"
                      : "border-cyan-900/40 hover:bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {micBusy
                    ? "⏳ Nhận…"
                    : recorder.recording
                      ? "● Đang ghi"
                      : "🎤 Mic"}
                </button>
                <button
                  onClick={toggleVoiceOut}
                  disabled={!tts.supported}
                  title={
                    !tts.supported
                      ? "Browser không hỗ trợ speechSynthesis"
                      : voiceOutOn
                        ? "Tắt giọng nói"
                        : "Bật giọng nói"
                  }
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    voiceOutOn
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
                      : "border-cyan-900/40 hover:bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {voiceOutOn ? "🔊 Loa" : "🔇 Loa"}
                </button>
                <button
                  onClick={reset}
                  disabled={busy || messages.length === 0}
                  className="text-xs px-3 py-1.5 rounded-md border border-cyan-900/40 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </header>

        {/* MIDDLE: avatar shows through, chat card bottom-anchored */}
        <div className="flex-1 flex flex-col justify-end items-center px-4 pb-3">
          {micError && (
            <div className="mb-2 pointer-events-auto text-rose-300 text-xs text-center py-2 px-3 border border-rose-900/50 rounded-md bg-rose-950/40 backdrop-blur-md max-w-2xl">
              🎤 {micError}
            </div>
          )}

          {messages.length > 0 && (
            <HudFrame
              active={isActive}
              className="pointer-events-auto w-full max-w-3xl rounded-lg border border-cyan-900/30 bg-zinc-950/45 backdrop-blur-md shadow-[0_0_40px_-15px_rgba(34,211,238,0.35)]"
            >
              <div
                ref={scrollRef}
                className="max-h-56 overflow-y-auto px-4 py-3 space-y-3"
              >
                {messages.map((m, i) => (
                  <Bubble key={i} message={m} />
                ))}
                {busy &&
                  messages[messages.length - 1]?.speaker === "user" && (
                    <div className="text-xs text-zinc-500 italic px-1">
                      đang nghĩ…
                    </div>
                  )}
              </div>
            </HudFrame>
          )}
        </div>

        {/* BOTTOM BAR */}
        <footer className="pointer-events-auto px-6 py-3 border-t border-cyan-900/40 bg-zinc-950/40 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="w-full max-w-3xl mx-auto flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder={busy ? "Đang trả lời…" : "Hỏi Nova…"}
              autoFocus
              className="flex-1 bg-zinc-900/70 border border-cyan-900/40 rounded-md px-3 py-2 outline-none focus:border-cyan-400 disabled:opacity-50 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="px-5 py-2 rounded-md bg-cyan-600/90 hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
            >
              Gửi
            </button>
          </form>
        </footer>
      </div>
    </>
  );
}

function appendInfo(
  setter: React.Dispatch<React.SetStateAction<Message[]>>,
  text: string,
) {
  setter((m) => [...m, { speaker: "system", text, kind: "info" }]);
}

function appendToken(
  setter: React.Dispatch<React.SetStateAction<Message[]>>,
  ev: Message,
) {
  setter((m) => {
    const last = m[m.length - 1];
    if (last && last.speaker === ev.speaker && last.kind !== "info") {
      return [...m.slice(0, -1), { ...last, text: last.text + ev.text }];
    }
    return [...m, { speaker: ev.speaker, text: ev.text }];
  });
}

function Bubble({ message }: { message: Message }) {
  const meta = SPEAKER_META[message.speaker] ?? SPEAKER_META.system;

  if (message.kind === "info" || message.speaker === "system") {
    return (
      <div className="text-xs text-zinc-500 italic text-center py-2 px-4">
        » {message.text}
      </div>
    );
  }

  const isUser = message.speaker === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${meta.bubble}`}>
        <div className={`text-xs font-medium mb-1 ${meta.accent}`}>
          {meta.label}
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.text}
        </div>
      </div>
    </div>
  );
}
