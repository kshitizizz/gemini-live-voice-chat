/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, PhoneOff, Loader2, AlertCircle, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { MathRenderer } from "./components/MathRenderer";
import { useLiveApi } from "./hooks/use-live-api";

interface ConversationEntry {
  role: "user" | "agent";
  text: string;
}

export default function App() {
  const { connect, disconnect, isConnected, isConnecting, error, inputAnalyser, outputAnalyser } =
    useLiveApi();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [wrongAnswer, setWrongAnswer] = useState("");
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
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
        return [...prev.slice(0, -1), { role: "user" as const, text: last.text + text }];
      }
      return [...prev, { role: "user", text: text.trim() }];
    });
  }, []);

  const onAgentTranscript = useCallback((text: string) => {
    if (!text?.trim()) return;
    setConversationLog((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "agent") {
        return [...prev.slice(0, -1), { role: "agent" as const, text: last.text + text }];
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
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col font-sans selection:bg-indigo-500/30">
      <div className="flex-1 flex min-h-0 p-4 gap-4">
        {/* Left Panel (~60%) */}
        <div className="flex-6 min-w-0 flex flex-col gap-4 overflow-hidden">
          <div className="text-center shrink-0">
            <h1 className="text-2xl font-semibold tracking-tight">Math Tutor</h1>
            <p className="text-neutral-400 text-sm">Enter a problem and get voice help</p>
          </div>

          {/* Question Section */}
          <div className="shrink-0 space-y-2">
            <label className="block text-sm font-medium text-neutral-300">Math Problem</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Solve for x: $x^2 - 4 = 0$"
              className="w-full h-24 px-4 py-3 bg-neutral-800/50 rounded-xl border border-white/10 text-white placeholder-neutral-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              disabled={isSubmitted}
            />
            {question.trim() && (
              <div className="px-4 py-2 bg-neutral-800/30 rounded-lg border border-white/5">
                <span className="text-xs text-neutral-500 block mb-1">Preview:</span>
                <MathRenderer content={question} />
              </div>
            )}
          </div>

          {/* Answer Section */}
          <div className="shrink-0 space-y-2">
            <label className="block text-sm font-medium text-neutral-300">
              Correct Answer (for tutor reference only)
            </label>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="e.g. x = 2 or x = -2"
              className="w-full px-4 py-3 bg-neutral-800/50 rounded-xl border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              disabled={isSubmitted}
            />
          </div>

          {/* Wrong Answer Section */}
          <div className="shrink-0 space-y-2">
            <label className="block text-sm font-medium text-neutral-300">
              Your Attempt / Wrong Answer (optional)
            </label>
            <input
              type="text"
              value={wrongAnswer}
              onChange={(e) => setWrongAnswer(e.target.value)}
              placeholder="e.g. x = 3 (what you got - helps tutor tailor the hint)"
              className="w-full px-4 py-3 bg-neutral-800/50 rounded-xl border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              disabled={isSubmitted}
            />
            <p className="text-xs text-neutral-500">
              The tutor will analyze if your answer is random or if you need a nudge in the right direction.
            </p>
          </div>

          {/* Submit Button */}
          <div className="shrink-0">
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
              Submit & Start Session
            </button>
          </div>

          {/* Conversation Log */}
          <div className="flex flex-col min-h-0">
            <label className="block text-sm font-medium text-neutral-300 shrink-0 mb-2">
              Conversation
            </label>
            <div
              ref={conversationScrollRef}
              className="h-64 overflow-y-auto overflow-x-hidden bg-neutral-800/30 rounded-xl border border-white/10 p-4 space-y-3"
            >
              {conversationLog.length === 0 && !isConnected && !isConnecting && (
                <p className="text-neutral-500 text-sm">Submit a problem to start the tutoring session.</p>
              )}
              {conversationLog.length === 0 && (isConnected || isConnecting) && (
                <p className="text-neutral-500 text-sm">Waiting for the tutor to greet you...</p>
              )}
              {conversationLog.map((entry, i) => (
                <div
                  key={i}
                  className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2 rounded-xl ${
                      entry.role === "user"
                        ? "bg-indigo-500/30 text-indigo-100"
                        : "bg-neutral-700/50 text-neutral-200"
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

        {/* Right Panel (~40%) - Voice Agent */}
        <div className="flex-4 min-w-0 flex flex-col gap-4">
          <div className="relative aspect-video bg-neutral-800/50 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col items-center justify-center flex-1 min-h-[200px]">
            <AnimatePresence mode="wait">
              {!isConnected && !isConnecting && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center space-y-4 p-6"
                >
                  <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto ring-1 ring-indigo-500/50">
                    <Mic className="w-8 h-8 text-indigo-400" />
                  </div>
                  <p className="text-neutral-400 text-sm">Submit a problem to connect</p>
                </motion.div>
              )}

              {isConnecting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4"
                >
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  <p className="text-neutral-400 text-sm">Connecting to Gemini...</p>
                </motion.div>
              )}

              {isConnected && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex flex-col items-center justify-center gap-6 p-6"
                >
                  <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
                    <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">
                      Gemini (Output)
                    </span>
                    <div className="w-full h-24 flex items-center justify-center">
                      {outputAnalyser && (
                        <AudioVisualizer
                          analyser={outputAnalyser}
                          width={300}
                          height={80}
                          color="#818cf8"
                        />
                      )}
                    </div>
                  </div>
                  <div className="w-full h-px bg-white/5" />
                  <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
                    <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                      You (Input)
                    </span>
                    <div className="w-full h-24 flex items-center justify-center">
                      {inputAnalyser && (
                        <AudioVisualizer
                          analyser={inputAnalyser}
                          width={300}
                          height={80}
                          color="#34d399"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="absolute top-4 left-4 right-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error.message}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setMicEnabled(!micEnabled)}
              className={`p-3 rounded-full transition-all duration-200 ${
                micEnabled
                  ? "bg-neutral-800 hover:bg-neutral-700 text-white"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
              disabled={!isConnected}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <button
              onClick={handleDisconnect}
              disabled={!isConnected}
              className={`h-14 px-6 rounded-full font-medium flex items-center gap-2 transition-all duration-200 shadow-lg ${
                isConnected
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                  : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
              }`}
            >
              <PhoneOff className="w-5 h-5" />
              End Call
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
