import { useRef, useState, useCallback } from "react";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { buildMathTutorSystemInstruction } from "../prompts/math-tutor";

const API_KEY = process.env.GEMINI_API_KEY as string;
const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

export interface ConnectConfig {
  question: string;
  answer: string;
  wrongAnswer?: string;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
}

export interface UseLiveApiResult {
  connect: (config: ConnectConfig) => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
}

export function useLiveApi(): UseLiveApiResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextScheduledTimeRef = useRef<number>(0);
  const greetingSentRef = useRef<boolean>(false);

  // Initialize AudioContext
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Request 16kHz if possible
      });
    }
    return audioContextRef.current;
  }, []);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.warn("Error closing session", e);
      }
    }
    sessionRef.current = null;

    if (inputProcessorRef.current) {
      inputProcessorRef.current.disconnect();
      inputProcessorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(async (config: ConnectConfig) => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    setError(null);

    const { question, answer, wrongAnswer, onUserTranscript, onAgentTranscript } = config;
    greetingSentRef.current = false;

    try {
      const ctx = ensureAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // 1. Setup Input (Microphone)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      const inputSource = ctx.createMediaStreamSource(stream);
      inputSourceRef.current = inputSource;

      const inputAnalyser = ctx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputSource.connect(inputAnalyser);
      inputAnalyserRef.current = inputAnalyser;

      // Processor to capture audio data
      // Buffer size 512 -> 32ms latency at 16kHz
      const processor = ctx.createScriptProcessor(512, 1, 1);
      inputProcessorRef.current = processor;

      inputAnalyser.connect(processor);
      processor.connect(ctx.destination); // ScriptProcessor needs to be connected to output to fire events

      // 2. Setup Output Analyser (for visualizer)
      const outputAnalyser = ctx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyser.smoothingTimeConstant = 0.8;
      outputAnalyserRef.current = outputAnalyser;

      // 3. Connect to Gemini
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      // Reset scheduling
      nextScheduledTimeRef.current = ctx.currentTime + 0.1;

      const systemInstruction = buildMathTutorSystemInstruction(question, answer, wrongAnswer);

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            setIsConnected(true);
            setIsConnecting(false);
          },
          onmessage: (msg: LiveServerMessage) => {
            // Send trigger once when setup is complete (server is ready to accept content)
            if (msg.setupComplete && !greetingSentRef.current) {
              greetingSentRef.current = true;
              session.sendClientContent({
                turns: { role: "user", parts: [{ text: "The student is ready. Introduce yourself and ask what they need to solve the question." }] },
                turnComplete: true,
              });
            }
            // Handle transcriptions
            const serverContent = msg.serverContent;
            if (serverContent?.outputTranscription?.text) {
              onAgentTranscript?.(serverContent.outputTranscription.text);
            }
            if (serverContent?.inputTranscription?.text) {
              onUserTranscript?.(serverContent.inputTranscription.text);
            }

            // Handle Audio Output
            const data = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (data) {
              // Decode Base64 to Int16
              const binaryString = atob(data);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const int16 = new Int16Array(bytes.buffer);

              // Convert Int16 to Float32
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768.0;
              }

              // Play Audio
              const buffer = ctx.createBuffer(1, float32.length, 24000); // Gemini output is usually 24kHz
              buffer.getChannelData(0).set(float32);

              const source = ctx.createBufferSource();
              source.buffer = buffer;

              // Connect to analyser then destination
              source.connect(outputAnalyser);
              outputAnalyser.connect(ctx.destination);

              // Schedule playback
              const now = ctx.currentTime;
              const start = Math.max(now, nextScheduledTimeRef.current);
              source.start(start);
              nextScheduledTimeRef.current = start + buffer.duration;
            }
          },
          onclose: () => {
            console.log("Gemini Live Closed");
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            setError(err instanceof Error ? err : new Error(String(err)));
          },
        },
      });

      sessionRef.current = session;

      // 4. Handle Input Streaming
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Simple resampling if needed
        let dataToSend = inputData;
        if (ctx.sampleRate !== 16000) {
            const ratio = ctx.sampleRate / 16000;
            const newLength = Math.floor(inputData.length / ratio);
            const resampled = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                resampled[i] = inputData[Math.floor(i * ratio)];
            }
            dataToSend = resampled;
        }

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(dataToSend.length);
        for (let i = 0; i < dataToSend.length; i++) {
          const s = Math.max(-1, Math.min(1, dataToSend[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to Base64
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(pcmData.buffer))
        );

        // Send to Gemini
        session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: base64,
          },
        });
      };

    } catch (err: any) {
      console.error("Connection failed:", err);
      setError(err);
      setIsConnecting(false);
      disconnect(); // Cleanup
    }
  }, [isConnected, isConnecting, ensureAudioContext, disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    isConnecting,
    error,
    inputAnalyser: inputAnalyserRef.current,
    outputAnalyser: outputAnalyserRef.current,
  };
}
