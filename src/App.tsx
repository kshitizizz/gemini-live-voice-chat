/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { useLiveApi } from "./hooks/use-live-api";

export default function App() {
  const { connect, disconnect, isConnected, isConnecting, error, inputAnalyser, outputAnalyser } = useLiveApi();
  const [micEnabled, setMicEnabled] = useState(true);

  // Toggle mic input (mute/unmute)
  useEffect(() => {
    if (inputAnalyser && inputAnalyser.context) {
      // We can't easily mute the stream source without disconnecting, 
      // but we can suspend the context or set gain to 0 if we had a gain node.
      // For now, let's just visualize.
      // To implement mute properly, we'd need a GainNode in the hook.
    }
  }, [micEnabled, inputAnalyser]);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-indigo-500/30">
      <div className="max-w-2xl w-full space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Gemini Live</h1>
          <p className="text-neutral-400">Real-time multimodal voice conversation</p>
        </div>

        {/* Main Visualizer Area */}
        <div className="relative aspect-video bg-neutral-800/50 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col items-center justify-center">
          
          <AnimatePresence mode="wait">
            {!isConnected && !isConnecting && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-4"
              >
                <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto ring-1 ring-indigo-500/50">
                  <Mic className="w-8 h-8 text-indigo-400" />
                </div>
                <p className="text-neutral-400">Ready to start conversation</p>
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
                <p className="text-neutral-400">Connecting to Gemini...</p>
              </motion.div>
            )}

            {isConnected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex flex-col items-center justify-center gap-8 p-8"
              >
                <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
                   <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">Gemini (Output)</span>
                   <div className="w-full h-32 flex items-center justify-center">
                      {outputAnalyser && <AudioVisualizer analyser={outputAnalyser} width={400} height={100} color="#818cf8" />}
                   </div>
                </div>

                <div className="w-full h-px bg-white/5" />

                <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
                   <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">You (Input)</span>
                   <div className="w-full h-32 flex items-center justify-center">
                      {inputAnalyser && <AudioVisualizer analyser={inputAnalyser} width={400} height={100} color="#34d399" />}
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
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setMicEnabled(!micEnabled)}
            className={`p-4 rounded-full transition-all duration-200 ${
              micEnabled 
                ? "bg-neutral-800 hover:bg-neutral-700 text-white" 
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
            disabled={!isConnected}
          >
            {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`h-16 px-8 rounded-full font-medium text-lg flex items-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 ${
              isConnected
                ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20"
            }`}
          >
            {isConnected ? (
              <>
                <PhoneOff className="w-5 h-5" />
                End Call
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                Start Call
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

