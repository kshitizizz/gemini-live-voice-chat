import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, PhoneOff, Loader2, AlertCircle, Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { MathRenderer } from "./components/MathRenderer";
import { useOpenAiWebRtc } from "./hooks/use-openai-webrtc";

interface ConversationEntry {
  role: "user" | "agent";
  text: string;
}

export default function OpenAIApp() {
  const {
    connect,
    disconnect,
    toggleMute,
    isMicMuted,
    isConnected,
    isConnecting,
    error,
    inputAnalyser,
    outputAnalyser,
  } = useOpenAiWebRtc();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [wrongAnswer, setWrongAnswer] = useState("");
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationScrollRef.current?.scrollTo({
      top: conversationScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversationLog]);

  const onUserTranscript = useCallback((text: string) => {
    if (!text?.trim()) return;
    setConversationLog((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "user") {
        return [...prev.slice(0, -1), { role: "user" as const, text: `${last.text}${text}` }];
      }
      return [...prev, { role: "user", text: text.trim() }];
    });
  }, []);

  const onAgentTranscript = useCallback((text: string) => {
    if (!text?.trim()) return;
    setConversationLog((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "agent") {
        return [...prev.slice(0, -1), { role: "agent" as const, text: `${last.text}${text}` }];
      }
      return [...prev, { role: "agent", text: text.trim() }];
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    setIsSubmitted(true);
    setConversationLog([]);
    connect({
      question: q,
      answer: a,
      wrongAnswer: wrongAnswer.trim() || undefined,
      onUserTranscript,
      onAgentTranscript,
    });
  }, [question, answer, wrongAnswer, connect, onUserTranscript, onAgentTranscript]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setIsSubmitted(false);
    setConversationLog([]);
  }, [disconnect]);

  const canSubmit = question.trim().length > 0 && answer.trim().length > 0 && !isConnected && !isConnecting;

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-neutral-900/80 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Math Tutor
            </h1>
            <p className="text-sm text-neutral-400">OpenAI Realtime (WebRTC) - Tutor Mode</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-full border ${
                isConnected
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : isConnecting
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-neutral-800 border-white/10 text-neutral-300"
              }`}
            >
              {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Idle"}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full border ${
                isMicMuted
                  ? "bg-red-500/15 border-red-500/30 text-red-300"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              }`}
            >
              Mic: {isMicMuted ? "Muted" : "Live"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 min-h-[70vh]">
          <div className="lg:col-span-6 space-y-4 min-w-0">
            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4 space-y-3">
              <label className="block text-sm font-medium text-neutral-300">Math Problem</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Solve for x: $x^2 - 4 = 0$"
                className="w-full h-24 px-4 py-3 bg-neutral-800/70 rounded-xl border border-white/10 text-white placeholder-neutral-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                disabled={isSubmitted}
              />
              {question.trim() && (
                <div className="px-4 py-2 bg-neutral-800/40 rounded-xl border border-white/10">
                  <span className="text-xs text-neutral-500 block mb-1">Preview</span>
                  <MathRenderer content={question} />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4 space-y-3">
              <label className="block text-sm font-medium text-neutral-300">
                Correct Answer (for tutor reference only)
              </label>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="e.g. x = 2 or x = -2"
                className="w-full px-4 py-3 bg-neutral-800/70 rounded-xl border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                disabled={isSubmitted}
              />

              <label className="block text-sm font-medium text-neutral-300">Your Attempt (optional)</label>
              <input
                type="text"
                value={wrongAnswer}
                onChange={(e) => setWrongAnswer(e.target.value)}
                placeholder="e.g. x = 3"
                className="w-full px-4 py-3 bg-neutral-800/70 rounded-xl border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                disabled={isSubmitted}
              />
              <p className="text-xs text-neutral-500">
                If provided, the tutor uses this to tailor the first hint.
              </p>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                  canSubmit
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                    : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                }`}
              >
                <Send className="w-5 h-5" />
                Start OpenAI Session
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
              <label className="block text-sm font-medium text-neutral-300 mb-2">Conversation</label>
              <div
                ref={conversationScrollRef}
                className="h-72 overflow-y-auto overflow-x-hidden bg-neutral-800/40 rounded-xl border border-white/10 p-4 space-y-3"
              >
                {conversationLog.length === 0 && !isConnected && !isConnecting && (
                  <p className="text-neutral-500 text-sm">Start a session to begin tutoring.</p>
                )}
                {conversationLog.length === 0 && (isConnected || isConnecting) && (
                  <p className="text-neutral-500 text-sm">Waiting for tutor greeting...</p>
                )}
                {conversationLog.map((entry, i) => (
                  <div key={i} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-4 py-2 rounded-xl ${
                        entry.role === "user"
                          ? "bg-indigo-500/25 text-indigo-100"
                          : "bg-neutral-700/50 text-neutral-100"
                      }`}
                    >
                      <span className="text-xs font-mono opacity-70 block mb-1">
                        {entry.role === "user" ? "You" : "Tutor"}
                      </span>
                      <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 min-w-0 space-y-4">
            <div className="relative rounded-2xl border border-white/10 bg-neutral-900/70 p-4 min-h-[340px]">
              <AnimatePresence mode="wait">
                {!isConnected && !isConnecting && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="h-full flex flex-col items-center justify-center text-center gap-3 py-10"
                  >
                    <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center ring-1 ring-indigo-500/50">
                      <Mic className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-neutral-300 text-sm">OpenAI tutor will appear here after connection.</p>
                  </motion.div>
                )}

                {isConnecting && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center gap-4 py-10"
                  >
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-neutral-300 text-sm">Connecting to OpenAI realtime...</p>
                  </motion.div>
                )}

                {isConnected && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">
                        OpenAI Output
                      </span>
                      <div className="h-24 mt-2 flex items-center justify-center">
                        {outputAnalyser && (
                          <AudioVisualizer analyser={outputAnalyser} width={300} height={80} color="#818cf8" />
                        )}
                      </div>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div>
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                        Your Input
                      </span>
                      <div className="h-24 mt-2 flex items-center justify-center">
                        {inputAnalyser && (
                          <AudioVisualizer analyser={inputAnalyser} width={300} height={80} color="#34d399" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="absolute top-3 left-3 right-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{error.message}</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={toggleMute}
                  className={`h-12 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
                    isConnected
                      ? isMicMuted
                        ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        : "bg-neutral-800 text-white hover:bg-neutral-700"
                      : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  }`}
                  disabled={!isConnected}
                >
                  {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isMicMuted ? "Unmute" : "Mute"}
                </button>

                <button
                  onClick={handleDisconnect}
                  disabled={!isConnected}
                  className={`h-12 px-5 rounded-xl font-medium flex items-center gap-2 transition-all ${
                    isConnected
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  }`}
                >
                  <PhoneOff className="w-5 h-5" />
                  End Session
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
