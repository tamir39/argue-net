"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechOpts = {
  lang?: string;
  onResult?: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
};

export function useSpeechRecognition(opts: SpeechOpts) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const cbRef = useRef(opts);
  cbRef.current = opts;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: any =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = opts.lang ?? "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript as string;
        if (r.isFinal) final += t;
        else interim += t;
      }
      const text = (final || interim).trim();
      cbRef.current.onResult?.(text, !!final);
    };
    rec.onend = () => {
      setListening(false);
      cbRef.current.onEnd?.();
    };
    rec.onerror = () => {
      setListening(false);
    };
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, [opts.lang]);

  const start = useCallback(() => {
    if (!recRef.current || listening) return;
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* already started or transient — ignore */
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    try {
      recRef.current.stop();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, listening, start, stop };
}

export function useSpeechSynthesis(lang = "vi-VN") {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const code = lang.split("-")[0];
      const match =
        voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(code));
      if (match) setVoice(match);
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [lang]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const cleaned = text.replace(/\*\*/g, "").replace(/[*_`#>]/g, "");
      const u = new SpeechSynthesisUtterance(cleaned);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    },
    [voice, lang, supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported, hasVietnameseVoice: !!voice };
}
