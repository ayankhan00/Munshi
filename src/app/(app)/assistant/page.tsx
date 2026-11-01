"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  History,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  intent?: string;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

interface SessionMessage {
  role: string;
  content: string;
  intent: string | null;
  payload?: string | null;
}

const SESSION_KEY = "munshi:assistantSessionId";
const VOICE_SILENCE_MS = 1200;
const VOICE_MAX_RECORD_MS = 12000;
const VOICE_SPEECH_RMS = 0.01;

const SUGGESTIONS = [
  "Add expense 500 for lunch",
  "Salary received 150000",
  "What is my balance?",
  "How much did I spend this month?",
  "Add task pay electricity bill by tomorrow",
  "Remind me to call mom at 6pm tomorrow",
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function concatAudio(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [usingGemini, setUsingGemini] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardSpeechRef = useRef(false);
  const recordingRef = useRef(false);
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    setVoiceSupported(
      typeof AudioCtor === "function" &&
        typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  cleanupRef.current = cleanupRecorder;
  useEffect(() => {
    return () => cleanupRef.current();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await loadSessions();
        const saved = window.localStorage.getItem(SESSION_KEY);
        if (saved && (await openSession(saved))) return;
        if (saved) window.localStorage.removeItem(SESSION_KEY);
        if (list.length > 0) await openSession(list[0].id);
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  async function loadSessions(): Promise<ChatSession[]> {
    try {
      const res = await api<{ sessions: ChatSession[] }>("/api/assistant");
      const list = res.sessions.slice(0, 15);
      setSessions(list);
      return list;
    } catch {
      return [];
    }
  }

  async function openSession(id: string): Promise<boolean> {
    try {
      const res = await api<{ session: ChatSession; messages: SessionMessage[] }>(
        `/api/assistant?sessionId=${id}`,
      );
      setSessionId(res.session.id);
      window.localStorage.setItem(SESSION_KEY, res.session.id);
      setMessages(
        res.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            intent: m.intent ?? undefined,
          })),
      );
      const lastUser = [...res.messages]
        .reverse()
        .find((m) => m.role === "user");
      let used = false;
      if (lastUser?.payload) {
        try {
          used = Boolean(JSON.parse(lastUser.payload).usedGemini);
        } catch {
          used = false;
        }
      }
      setUsingGemini(used);
      setShowHistory(false);
      return true;
    } catch {
      return false;
    }
  }

  function newChat() {
    setSessionId(undefined);
    setMessages([]);
    setInput("");
    setUsingGemini(false);
    window.localStorage.removeItem(SESSION_KEY);
    setShowHistory(false);
  }

  async function deleteSession(id: string) {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      await api(`/api/assistant?sessionId=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setSessions((list) => list.filter((s) => s.id !== id));
      if (sessionId === id) newChat();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete conversation",
      );
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current || bootstrapping) return;
    sendingRef.current = true;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api<{
        reply: string;
        intent: string;
        usedGemini: boolean;
        sessionId: string;
      }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, sessionId }),
      });
      setSessionId(res.sessionId);
      setUsingGemini(res.usedGemini);
      window.localStorage.setItem(SESSION_KEY, res.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, intent: res.intent },
      ]);
      void loadSessions();
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function cleanupRecorder() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
    } catch {
      // already disconnected
    }
    processorRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {
      // already closed
    }
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
    recordingRef.current = false;
  }

  async function stopRecordingAndTranscribe() {
    if (!recordingRef.current) return;
    const sampleRate = audioCtxRef.current?.sampleRate ?? 44100;
    const chunks = chunksRef.current.slice();
    const heardSpeech = heardSpeechRef.current;
    cleanupRecorder();
    setListening(false);
    if (!heardSpeech || chunks.length === 0) {
      setInput("");
      return;
    }

    const bytes = new Uint8Array(
      await encodeWav(concatAudio(chunks), sampleRate).arrayBuffer(),
    );
    setLoading(true);
    try {
      const res = await api<{
        transcript: string;
        reply: string;
        intent: string;
        usedGemini: boolean;
        sessionId: string;
      }>("/api/assistant/voice", {
        method: "POST",
        body: JSON.stringify({
          audio: toBase64(bytes),
          mimeType: "audio/wav",
          sessionId,
        }),
      });
      const transcript = res.transcript.trim();
      if (transcript) {
        setMessages((m) => [...m, { role: "user", content: transcript }]);
      }
      setSessionId(res.sessionId);
      setUsingGemini(res.usedGemini);
      window.localStorage.setItem(SESSION_KEY, res.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, intent: res.intent },
      ]);
      void loadSessions();
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            err instanceof Error ? err.message : "Could not process your voice.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (recordingRef.current) return;
    recordingRef.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Voice recording needs HTTPS and a supported browser.");
      }
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) throw new Error("Audio recording is not supported here.");
      // Create/resume the AudioContext inside the tap gesture; iOS blocks it
      // otherwise and the recorder would capture nothing.
      const ctx = new AudioCtor();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain();
      gain.gain.value = 0;

      chunksRef.current = [];
      heardSpeechRef.current = false;
      processor.onaudioprocess = (event) => {
        if (!recordingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
        let sum = 0;
        for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        if (rms > VOICE_SPEECH_RMS) {
          heardSpeechRef.current = true;
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            void stopRecordingAndTranscribe();
          }, VOICE_SILENCE_MS);
        }
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      streamRef.current = stream;
      processorRef.current = processor;
      setListening(true);
      maxTimerRef.current = setTimeout(() => {
        void stopRecordingAndTranscribe();
      }, VOICE_MAX_RECORD_MS);
    } catch (err) {
      cleanupRecorder();
      setListening(false);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            err instanceof Error ? err.message : "Microphone access was denied.",
        },
      ]);
    }
  }

  function toggleListening() {
    if (bootstrapping) return;
    if (recordingRef.current) {
      void stopRecordingAndTranscribe();
    } else {
      void startRecording();
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <PageHeader
        title="AI Assistant"
        description="Ask in plain English (or Urdu) to log money, check balances, create tasks and set reminders. Tap the mic and speak (tap again to stop), e.g. 2750 on burgers."
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="md:hidden"
          onClick={() => setShowHistory(true)}
        >
          <History className="h-4 w-4" />
          History
        </Button>
        {sessionId && messages.length > 0 ? (
          <Badge tone={usingGemini ? "success" : "muted"}>
            <Sparkles className="mr-1 h-3 w-3" />
            {usingGemini ? "Gemini" : "offline"}
          </Badge>
        ) : null}
      </PageHeader>

      <div className="relative flex min-h-0 flex-1 gap-4">
        {showHistory ? (
          <button
            type="button"
            aria-label="Close history"
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setShowHistory(false)}
          />
        ) : null}

        <Card
          className={cn(
            "z-40 w-64 shrink-0 flex-col overflow-hidden p-0",
            "fixed inset-y-4 left-4 md:static",
            showHistory ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-sm font-semibold">Recent</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setShowHistory(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={newChat}
            >
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
            {sessions.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-1 rounded-lg pr-1",
                    s.id === sessionId ? "bg-muted" : "",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openSession(s.id)}
                    className={cn(
                      "min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                      s.id === sessionId
                        ? "font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="line-clamp-2">{s.title}</span>
                    <span className="mt-0.5 block text-[11px] opacity-60">
                      {timeAgo(s.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSession(s.id)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete conversation ${s.title}`}
                    title="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {bootstrapping ? (
              <LoadingState label="Loading your conversation..." />
            ) : messages.length === 0 ? (
              <div className="mx-auto max-w-lg py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Start by trying one of these:
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3",
                    m.role === "user" && "flex-row-reverse",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {m.role === "user" ? (
                      <UserIcon className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.intent && m.role === "assistant" ? (
                      <p className="mt-1.5 text-xs opacity-60">
                        intent: {m.intent}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 animate-pulse" />
                Thinking...
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                bootstrapping
                  ? "Loading..."
                  : listening
                    ? "Listening..."
                    : "Type a message..."
              }
              disabled={bootstrapping}
              className="flex-1"
            />
            {voiceSupported ? (
              <Button
                type="button"
                variant={listening ? "danger" : "outline"}
                size="icon"
                onClick={toggleListening}
                disabled={loading || bootstrapping}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                title={listening ? "Stop listening" : "Speak your transaction"}
              >
                {listening ? (
                  <MicOff className="h-4 w-4 animate-pulse" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            ) : null}
            <Button type="submit" disabled={loading || bootstrapping || !input.trim()}>
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
