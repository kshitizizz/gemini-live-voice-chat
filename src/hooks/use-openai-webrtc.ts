import { useCallback, useRef, useState } from "react";
import { buildMathTutorSystemInstruction } from "../prompts/math-tutor";

const OPENAI_REALTIME_BASE_URL = "https://api.openai.com/v1/realtime";

export interface ConnectConfig {
  question: string;
  answer: string;
  wrongAnswer?: string;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
}

export interface UseOpenAiWebRtcResult {
  connect: (config: ConnectConfig) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  isMicMuted: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
}

interface OpenAiSessionResponse {
  clientSecret: string;
  model: string;
}

export function useOpenAiWebRtc(): UseOpenAiWebRtcResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const assistantRespondingRef = useRef(false);
  const lastHandledUserTranscriptRef = useRef("");
  const lastAssistantDoneAtRef = useRef(0);
  const responseWatchdogRef = useRef<number | null>(null);

  const clearResponseWatchdog = useCallback(() => {
    if (responseWatchdogRef.current !== null) {
      window.clearTimeout(responseWatchdogRef.current);
      responseWatchdogRef.current = null;
    }
  }, []);

  const startResponseWatchdog = useCallback(() => {
    clearResponseWatchdog();
    responseWatchdogRef.current = window.setTimeout(() => {
      assistantRespondingRef.current = false;
      lastAssistantDoneAtRef.current = Date.now();
    }, 12000);
  }, [clearResponseWatchdog]);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const disconnect = useCallback(() => {
    assistantRespondingRef.current = false;
    lastHandledUserTranscriptRef.current = "";
    lastAssistantDoneAtRef.current = 0;
    clearResponseWatchdog();
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch (closeError) {
        console.warn("Error closing OpenAI data channel", closeError);
      }
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (closeError) {
        console.warn("Error closing OpenAI peer connection", closeError);
      }
      peerConnectionRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }

    if (outputSourceRef.current) {
      outputSourceRef.current.disconnect();
      outputSourceRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsMicMuted(false);
  }, [clearResponseWatchdog]);

  const setMuted = useCallback((muted: boolean) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setIsMicMuted(muted);
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMicMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const connect = useCallback(
    async (config: ConnectConfig) => {
      if (isConnected || isConnecting) return;

      setIsConnecting(true);
      setError(null);
      assistantRespondingRef.current = false;
      lastHandledUserTranscriptRef.current = "";
      lastAssistantDoneAtRef.current = 0;

      const { question, answer, wrongAnswer, onUserTranscript, onAgentTranscript } = config;

      try {
        const ctx = ensureAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const sessionResp = await fetch("/api/openai/session", { method: "POST" });
        if (!sessionResp.ok) {
          const errorText = await sessionResp.text();
          throw new Error(`Failed to get OpenAI session token: ${errorText}`);
        }
        const { clientSecret, model } = (await sessionResp.json()) as OpenAiSessionResponse;

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        localStreamRef.current = localStream;
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setIsMicMuted(false);

        const inputSource = ctx.createMediaStreamSource(localStream);
        inputSourceRef.current = inputSource;

        const inputAnalyser = ctx.createAnalyser();
        inputAnalyser.fftSize = 256;
        inputAnalyser.smoothingTimeConstant = 0.8;
        inputSource.connect(inputAnalyser);
        inputAnalyserRef.current = inputAnalyser;

        const peerConnection = new RTCPeerConnection();
        peerConnectionRef.current = peerConnection;
        const dataChannel = peerConnection.createDataChannel("oai-events");
        dataChannelRef.current = dataChannel;

        const remoteAudio = new Audio();
        remoteAudio.autoplay = true;
        audioElementRef.current = remoteAudio;

        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        remoteAudio.srcObject = remoteStream;

        const ensureRemoteAnalyser = () => {
          if (outputSourceRef.current || remoteStream.getAudioTracks().length === 0) {
            return;
          }
          const remoteSource = ctx.createMediaStreamSource(remoteStream);
          outputSourceRef.current = remoteSource;
          const outputAnalyser = ctx.createAnalyser();
          outputAnalyser.fftSize = 256;
          outputAnalyser.smoothingTimeConstant = 0.8;
          remoteSource.connect(outputAnalyser);
          outputAnalyserRef.current = outputAnalyser;
        };

        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            remoteStream.addTrack(track);
          });
          ensureRemoteAnalyser();
        };
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection.connectionState === "connected") {
            setIsConnected(true);
            setIsConnecting(false);
          } else if (
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "closed" ||
            peerConnection.connectionState === "disconnected"
          ) {
            setIsConnected(false);
          }
        };

        dataChannel.onmessage = (event) => {
          let payload: any;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }

          if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript) {
            const transcript = String(payload.transcript).trim();
            if (!transcript) return;
            const normalized = transcript.toLowerCase();
            if (normalized === lastHandledUserTranscriptRef.current) return;
            // Ignore likely echo right after assistant finishes speaking.
            if (Date.now() - lastAssistantDoneAtRef.current < 1200) return;
            lastHandledUserTranscriptRef.current = normalized;
            onUserTranscript?.(transcript);

            if (!assistantRespondingRef.current && dataChannel.readyState === "open") {
              assistantRespondingRef.current = true;
              startResponseWatchdog();
              dataChannel.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    modalities: ["audio", "text"],
                    instructions:
                      "Respond only in English. Keep the student focused on this exact problem and reaching the correct answer. Give one concise tutoring response, then stop and wait for the student.",
                  },
                })
              );
            }
            return;
          }

          if (payload.type === "response.audio_transcript.delta" && payload.delta) {
            onAgentTranscript?.(payload.delta);
            return;
          }

          if (payload.type === "response.audio_transcript.done") {
            return;
          }

          if (payload.type === "response.created") {
            assistantRespondingRef.current = true;
            startResponseWatchdog();
            return;
          }

          if (
            payload.type === "response.done" ||
            payload.type === "response.error" ||
            payload.type === "response.output_item.done"
          ) {
            assistantRespondingRef.current = false;
            lastAssistantDoneAtRef.current = Date.now();
            clearResponseWatchdog();
          }
        };

        dataChannel.onerror = () => {
          setError(new Error("OpenAI realtime data channel error."));
        };

        dataChannel.onopen = () => {
          const systemInstruction = `${buildMathTutorSystemInstruction(
            question,
            answer,
            wrongAnswer
          )}\n\nCRITICAL LANGUAGE RULE: Respond only in English. Never use Chinese or any other language.

PRIMARY GOAL: Get the student to the correct final answer for this exact problem.
FOCUS RULES:
- Stay strictly on this problem until solved.
- Do not discuss unrelated topics, examples, or tangents.
- If the student asks something unrelated, briefly redirect to the current problem.
- Use short step-by-step guidance and quick checks of student understanding.
- Ask one focused question at a time and wait for student reply.`;

          dataChannel.send(
            JSON.stringify({
              type: "session.update",
              session: {
                modalities: ["audio", "text"],
                instructions: systemInstruction,
                voice: "alloy",
                input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: { type: "server_vad", create_response: false, interrupt_response: true },
                max_response_output_tokens: 320,
              },
            })
          );

          dataChannel.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "The student is ready. Begin with your greeting in English only. Keep it short, give one hint for this exact problem, ask where they are stuck, then stop and wait.",
              },
            })
          );
          startResponseWatchdog();
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sdpResponse = await fetch(`${OPENAI_REALTIME_BASE_URL}?model=${encodeURIComponent(model)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });

        if (!sdpResponse.ok) {
          const errorText = await sdpResponse.text();
          throw new Error(`Failed to create OpenAI WebRTC session: ${errorText}`);
        }

        const answerSdp = await sdpResponse.text();
        await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (connectError: any) {
        console.error("OpenAI WebRTC connection failed:", connectError);
        setError(connectError instanceof Error ? connectError : new Error(String(connectError)));
        setIsConnecting(false);
        disconnect();
      }
    },
    [disconnect, ensureAudioContext, isConnected, isConnecting, startResponseWatchdog, clearResponseWatchdog]
  );

  return {
    connect,
    disconnect,
    toggleMute,
    setMuted,
    isMicMuted,
    isConnected,
    isConnecting,
    error,
    inputAnalyser: inputAnalyserRef.current,
    outputAnalyser: outputAnalyserRef.current,
  };
}
