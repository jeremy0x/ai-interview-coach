import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Message, Speaker } from "../types";
import { float32ToPCM16 } from "../utils/audioUtils";

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

// LiveSession type is not exported by the SDK, so we infer it from the return type of connect()
type LiveSession = Awaited<ReturnType<typeof ai.live.connect>>;

const SYSTEM_INSTRUCTION = `
You are Coach Riley, a high-stakes, executive-level public speaking coach. 
Your persona is demanding, strict, professional, and razor-sharp. You do not fluff your words. 
You are conducting a drill session with a user.

Rules:
1. Your goal is to simulate a high-pressure interview or board presentation.
2. Listen to the user's response. Wait for them to finish.
3. Once they are done, provide a concise critique (max 2 sentences) focusing on clarity, tone, or content. Be direct. If it was weak, say it.
4. Immediately follow the critique with a challenging, open-ended drill question related to leadership, strategy, or crisis management.
5. Keep your total response under 60 words to maintain a fast pace.
6. Do NOT use markdown formatting.
7. If the session starts and you haven't spoken, introduce yourself sternly and ask the first hard question immediately.
`;

export type LiveSessionCallbacks = {
  onAudioData: (base64Data: string) => void;
  onTranscriptUpdate: (speaker: Speaker, text: string, isFinal: boolean) => void;
  onClose: () => void;
  onVolumeUpdate: (volume: number) => void;
};

export class LiveSessionService {
  private activeSession: LiveSession | null = null;
  private inputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private callbacks: LiveSessionCallbacks;
  private isConnected: boolean = false;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  async connect() {
    this.isConnected = true;
    try {
      // Initialize Audio Context immediately to capture user gesture
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({
        sampleRate: 16000,
      });

      // Request permissions with Echo Cancellation to prevent feedback loops
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      console.log("Audio Stream Acquired");

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            console.log("Gemini Live Session Opened");
            // This callback is async, but we prepared resources already.
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            this.disconnect(); 
          },
          onerror: (err: unknown) => {
            console.error("Gemini Live Session Error:", err);
            this.disconnect();
          }
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      
      this.activeSession = await sessionPromise;

      if (this.isConnected) {
        await this.startAudioPipeline();
      } else {
        // If user cancelled while connecting
        this.activeSession.close();
      }

    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.disconnect();
    }
  }

  private async startAudioPipeline() {
      if (!this.inputAudioContext || !this.stream || !this.activeSession) return;

      // Ensure context is running (sometimes it suspends)
      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }

      const source = this.inputAudioContext.createMediaStreamSource(this.stream);
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.activeSession) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for UI
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
           sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        this.callbacks.onVolumeUpdate(rms);

        const base64Data = float32ToPCM16(inputData);
        
        try {
            this.activeSession.sendRealtimeInput({
                media: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
                }
            });
        } catch (err) {
            console.error("Error sending audio frame:", err);
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);
  }

  private handleMessage(message: LiveServerMessage) {
    const serverContent = message.serverContent;

    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
      const audioData = serverContent.modelTurn.parts[0].inlineData.data;
      this.callbacks.onAudioData(audioData);
    }

    if (serverContent?.outputTranscription?.text) {
        this.callbacks.onTranscriptUpdate(Speaker.Coach, serverContent.outputTranscription.text, false);
    }

    if (serverContent?.inputTranscription?.text) {
        this.callbacks.onTranscriptUpdate(Speaker.User, serverContent.inputTranscription.text, false);
    }
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this.activeSession) {
         try { 
            this.activeSession.close(); 
         } catch(e) {
            console.debug("Session already closed");
         }
         this.activeSession = null;
    }

    this.cleanup();
    this.callbacks.onClose();
  }

  private cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    
    if (this.inputAudioContext) {
      try {
        this.inputAudioContext.close();
      } catch (e) {
        // ignore
      }
      this.inputAudioContext = null;
    }
  }
}