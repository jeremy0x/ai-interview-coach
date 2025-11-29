/**
 * Decodes base64 string to Uint8Array.
 */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM data into an AudioBuffer.
 * Note: Gemini TTS output is typically 24kHz.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Converts Float32 audio data (from Web Audio API) to PCM Int16 base64 string
 * required by Gemini Live API.
 */
export function float32ToPCM16(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp between -1 and 1 and scale to Int16 range
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert to binary string
  let binary = '';
  const bytes = new Uint8Array(int16Array.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Manages gapless audio playback for streaming audio chunks.
 */
export class StreamAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private isPlaying: boolean = false;
  private onPlayStateChange?: (isPlaying: boolean) => void;

  constructor(onPlayStateChange?: (isPlaying: boolean) => void) {
    this.onPlayStateChange = onPlayStateChange;
  }

  private initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Match Gemini output rate
      });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  async queueAudio(base64Audio: string) {
    const ctx = this.initContext();
    const audioBytes = decode(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, ctx);

    // Ensure we schedule after the current time or the end of the last chunk
    const currentTime = ctx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) {
        this.isPlaying = false;
        this.onPlayStateChange?.(false);
      }
    };

    source.start(this.nextStartTime);
    this.sources.add(source);
    
    this.nextStartTime += audioBuffer.duration;

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlayStateChange?.(true);
    }
  }

  stop() {
    this.sources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // ignore
      }
    });
    this.sources.clear();
    this.nextStartTime = 0;
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
  }
}

export const audioPlayer = new StreamAudioPlayer();
