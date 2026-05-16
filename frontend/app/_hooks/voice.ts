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

export function useMicDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelectedState] = useState<string>("");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const saved = localStorage.getItem("arguenet_mic_id");
    if (saved) setSelectedState(saved);
  }, []);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices)
      return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    refresh();
    const onChange = () => refresh();
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [refresh, supported]);

  const setSelected = useCallback((id: string) => {
    setSelectedState(id);
    if (id) localStorage.setItem("arguenet_mic_id", id);
    else localStorage.removeItem("arguenet_mic_id");
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    if (permissionGranted) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionGranted(true);
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [permissionGranted, refresh, supported]);

  const claim = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!supported || !deviceId) return false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    },
    [supported],
  );

  return {
    supported,
    devices,
    selected,
    setSelected,
    permissionGranted,
    requestPermission,
    claim,
    refresh,
  };
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
