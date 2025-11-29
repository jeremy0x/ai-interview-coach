import { GoogleGenAI, Modality } from "@google/genai";
import { Message, Speaker } from "../types";
import { float32ToPCM16 } from "../utils/audioUtils";

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

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
};

export class LiveSessionService {
  private session: any = null;
  private inputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  async connect() {
    try {
      this.session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            console.log("Gemini Live Session Opened");
            await this.startAudioStream();
          },
          onmessage: (message: any) => {
            this.handleMessage(message);
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            this.cleanup();
            this.callbacks.onClose();
          },
          onerror: (err: any) => {
            console.error("Gemini Live Session Error:", err);
            this.cleanup();
            this.callbacks.onClose();
          }
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, authoritative male voice
            },
          },
          inputAudioTranscription: {
            model: "gemini-2.5-flash-native-audio-preview-09-2025" 
          },
          outputAudioTranscription: {
             model: "gemini-2.5-flash-native-audio-preview-09-2025" 
          }
        }
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.callbacks.onClose();
    }
  }

  private async startAudioStream() {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000, // 16kHz required for optimal Gemini input
    });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.inputAudioContext.createMediaStreamSource(this.stream);
      
      // Buffer size 4096 provides a good balance between latency and CPU usage
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const base64Data = float32ToPCM16(inputData);
        
        if (this.session) {
          this.session.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Data
            }
          });
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);

    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  private handleMessage(message: any) {
    const serverContent = message.serverContent;

    // 1. Handle Audio Output
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
      const audioData = serverContent.modelTurn.parts[0].inlineData.data;
      this.callbacks.onAudioData(audioData);
    }

    // 2. Handle Model Transcription (What Coach is saying)
    if (serverContent?.outputTranscription?.text) {
        // We receive chunks, but for simple UI we can just send them through. 
        // The UI handles appending or updating.
        this.callbacks.onTranscriptUpdate(Speaker.Coach, serverContent.outputTranscription.text, false);
    }

    // 3. Handle User Transcription (What User said)
    if (serverContent?.inputTranscription?.text) {
        this.callbacks.onTranscriptUpdate(Speaker.User, serverContent.inputTranscription.text, false);
    }
    
    if (serverContent?.turnComplete) {
       // Optional: Marker for turn completion
    }
  }

  async disconnect() {
    this.cleanup();
  }

  private cleanup() {
    if (this.session) {
       // No explicit close method documented on the promise wrapper immediately, 
       // but we should stop sending data.
       this.session = null; 
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
  }
}
