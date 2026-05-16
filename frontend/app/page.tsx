"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useMicDevices,
  useSpeechRecognition,
  useSpeechSynthesis,
} from "./_hooks/voice";

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
  const scrollRef = useRef<HTMLDivElement>(null);
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
      }
    },
    [input, busy, sessionId, voiceOutOn, tts],
  );

  const reset = useCallback(async () => {
    if (!sessionId) return;
    tts.cancel();
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

  const mic = useSpeechRecognition({
    lang: "vi-VN",
    onResult: (text, isFinal) => {
      setInput(text);
      if (isFinal && text.trim()) {
        send(text);
      }
    },
  });

  const micDevices = useMicDevices();

  const startMic = useCallback(async () => {
    if (!micDevices.permissionGranted) {
      await micDevices.requestPermission();
    }
    if (micDevices.selected) {
      await micDevices.claim(micDevices.selected);
    }
    mic.start();
  }, [mic, micDevices]);

  const toggleVoiceOut = useCallback(() => {
    setVoiceOutOn((on) => {
      if (on) tts.cancel();
      return !on;
    });
  }, [tts]);

  return (
    <main className="flex-1 flex flex-col items-center px-4">
      <div className="w-full max-w-3xl flex flex-col h-screen py-6">
        <header className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ArgueNet</h1>
            <p className="text-xs text-zinc-500">
              <span className="text-cyan-300">Nova</span>
              {" · "}
              <span className="text-emerald-300">Sol</span>
              {" · "}
              <span className="text-rose-300">Umbra</span>
              {" · "}
              <span className="text-amber-300">Polaris</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mounted && (
              <>
            {micDevices.devices.length > 1 && (
              <select
                value={micDevices.selected}
                onChange={(e) => micDevices.setSelected(e.target.value)}
                disabled={busy || mic.listening}
                title="Chọn microphone"
                className="text-xs bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 max-w-[180px] truncate"
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
              onClick={mic.listening ? mic.stop : startMic}
              disabled={busy || !mic.supported}
              title={
                !mic.supported
                  ? "Browser không hỗ trợ SpeechRecognition (thử Chrome/Edge)"
                  : mic.listening
                    ? "Đang nghe — bấm để dừng"
                    : "Bấm để nói"
              }
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                mic.listening
                  ? "border-rose-500 bg-rose-500/15 text-rose-200 animate-pulse"
                  : "border-zinc-700 hover:bg-zinc-800 text-zinc-200"
              }`}
            >
              {mic.listening ? "● Nghe" : "🎤 Mic"}
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
                  : "border-zinc-700 hover:bg-zinc-800 text-zinc-200"
              }`}
            >
              {voiceOutOn ? "🔊 Loa" : "🔇 Loa"}
            </button>
              </>
            )}
            <button
              onClick={reset}
              disabled={busy || messages.length === 0}
              className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-4 space-y-3"
        >
          {messages.length === 0 && (
            <div className="text-zinc-500 text-sm text-center py-16 leading-relaxed">
              Hỏi gì đó.
              <br />
              <span className="text-xs">
                Câu hỏi mở (vd. &quot;nên dùng X hay Y?&quot;) sẽ kích hoạt nhóm tranh luận.
              </span>
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} message={m} />
          ))}
          {busy && messages[messages.length - 1]?.speaker === "user" && (
            <div className="text-xs text-zinc-500 italic px-1">đang nghĩ…</div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="pt-4 border-t border-zinc-800 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={busy ? "Đang trả lời…" : "Bạn…"}
            autoFocus
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
          >
            Gửi
          </button>
        </form>
      </div>
    </main>
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
