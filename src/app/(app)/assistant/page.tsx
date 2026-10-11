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
  User as UserIcon,
  X,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
const VOICE_SEND_DELAY_MS = 1000;

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const pendingFinalRef = useRef("");
  const voiceTextRef = useRef("");
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setVoiceSupported(
      Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    );
  }, []);

  useEffect(() => {
    void (async () => {
      await loadSessions();
      const saved = window.localStorage.getItem(SESSION_KEY);
      if (saved) await openSession(saved);
    })();
  }, []);

  async function loadSessions() {
    try {
      const res = await api<{ sessions: ChatSession[] }>("/api/assistant");
      setSessions(res.sessions.slice(0, 15));
    } catch {
      // ignore
    }
  }

  async function openSession(id: string) {
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
    } catch {
      // ignore
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

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
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
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function clearVoiceTimer() {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  function scheduleVoiceSend(recognition: SpeechRecognition) {
    clearVoiceTimer();
    voiceTimerRef.current = setTimeout(() => {
      voiceTimerRef.current = null;
      const text = voiceTextRef.current.trim();
      voiceTextRef.current = "";
      pendingFinalRef.current = "";
      setInput("");
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
      if (text) void send(text);
    }, VOICE_SEND_DELAY_MS);
  }

  function toggleListening() {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    if (listening) {
      clearVoiceTimer();
      const text = voiceTextRef.current.trim();
      voiceTextRef.current = "";
      pendingFinalRef.current = "";
      setInput("");
      try {
        recognitionRef.current?.stop();
      } catch {
        // already stopped
      }
      if (text) void send(text);
      return;
    }

    pendingFinalRef.current = "";
    voiceTextRef.current = "";

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) {
        pendingFinalRef.current = `${pendingFinalRef.current} ${final}`.trim();
      }
      const combined = `${pendingFinalRef.current} ${interim}`.trim();
      voiceTextRef.current = combined;
      setInput(combined);
      scheduleVoiceSend(recognition);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <PageHeader
        title="AI Assistant"
        description="Ask in plain English (or Urdu) to log money, check balances, create tasks and set reminders. Tap the mic and speak, e.g. 2750 on burgers."
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
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s.id)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                    s.id === sessionId
                      ? "bg-muted font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="line-clamp-2">{s.title}</span>
                  <span className="mt-0.5 block text-[11px] opacity-60">
                    {timeAgo(s.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
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
              placeholder={listening ? "Listening..." : "Type a message..."}
              className="flex-1"
            />
            {voiceSupported ? (
              <Button
                type="button"
                variant={listening ? "danger" : "outline"}
                size="icon"
                onClick={toggleListening}
                disabled={loading}
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
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
