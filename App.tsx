import React, { useState, useEffect, useRef } from 'react';
import { Message, Speaker, SessionState } from './types';
import { LiveSessionService } from './services/geminiService';
import { StreamAudioPlayer } from './utils/audioUtils';
import Transcript from './components/Transcript';
import UserCamera from './components/UserCamera';
import Visualizer from './components/Visualizer';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    isProcessing: false,
    isSpeaking: false,
  });
  
  // Track the current message being built by the stream to avoid flickering
  const [currentTranscript, setCurrentTranscript] = useState<{speaker: Speaker, text: string} | null>(null);

  const audioPlayerRef = useRef<StreamAudioPlayer | null>(null);
  const liveSessionRef = useRef<LiveSessionService | null>(null);

  // Initialize Audio Player
  useEffect(() => {
    audioPlayerRef.current = new StreamAudioPlayer((isPlaying) => {
      setSessionState(prev => ({ ...prev, isSpeaking: isPlaying }));
    });
    return () => {
      audioPlayerRef.current?.stop();
    };
  }, []);

  const handleStartSession = async () => {
    setMessages([]);
    setCurrentTranscript(null);
    setSessionState({ isActive: true, isProcessing: false, isSpeaking: false });

    // Initialize Live Session
    liveSessionRef.current = new LiveSessionService({
      onAudioData: (base64Data) => {
        audioPlayerRef.current?.queueAudio(base64Data);
      },
      onTranscriptUpdate: (speaker, text, isFinal) => {
         setCurrentTranscript(prev => {
             // If speaker changed, commit the previous transcript to history
             if (prev && prev.speaker !== speaker) {
                 addMessageToHistory(prev.speaker, prev.text);
                 return { speaker, text };
             }
             // Otherwise append or update
             // Note: The API sends incremental text, sometimes accumulated, sometimes chunks. 
             // Simple accumulation strategy:
             return { speaker, text: prev ? prev.text + text : text };
         });
      },
      onClose: () => {
        setSessionState({ isActive: false, isProcessing: false, isSpeaking: false });
        audioPlayerRef.current?.stop();
      }
    });

    await liveSessionRef.current.connect();
  };

  const handleEndSession = async () => {
    if (liveSessionRef.current) {
      await liveSessionRef.current.disconnect();
      liveSessionRef.current = null;
    }
    audioPlayerRef.current?.stop();
    setSessionState({ isActive: false, isProcessing: false, isSpeaking: false });
    setCurrentTranscript(null);
  };

  const addMessageToHistory = (speaker: Speaker, text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      speaker,
      text,
      timestamp: Date.now(),
    }]);
  };
  
  // Effect to commit transcript when it gets too stale or session ends could be added here
  // But for now we rely on speaker switching to commit.

  const displayCoachText = currentTranscript?.speaker === Speaker.Coach 
      ? currentTranscript.text 
      : messages.slice().reverse().find(m => m.speaker === Speaker.Coach)?.text;

  return (
    <div className="flex h-screen w-screen bg-white">
      {/* Left Panel - Main Interface */}
      <div className="flex-1 flex flex-col relative bg-gray-50">
        
        {/* Header */}
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                CR
             </div>
             <div>
                <h1 className="text-sm font-bold text-gray-900 tracking-tight">COACH RILEY</h1>
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${sessionState.isActive ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></span>
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                        {sessionState.isActive ? 'Live Connection' : 'Offline'}
                    </span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-2">
            {!sessionState.isActive ? (
                <button 
                    onClick={handleStartSession}
                    className="bg-gray-900 hover:bg-black text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    Start Drill
                </button>
            ) : (
                <button 
                    onClick={handleEndSession}
                    className="text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                    End Call
                </button>
            )}
          </div>
        </header>

        {/* Main Stage */}
        <main className="flex-1 p-6 flex flex-col justify-center items-center relative overflow-hidden">
             
             {/* Coach Display */}
             <div className="w-full max-w-4xl flex flex-col items-center justify-center space-y-8 z-10">
                
                {/* Visualizer / Avatar */}
                <div className="flex flex-col items-center justify-center h-24">
                     {sessionState.isActive ? (
                         <div className="flex flex-col items-center gap-4">
                            <div className={`w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shadow-xl ring-4 transition-all duration-300 ${sessionState.isSpeaking ? 'ring-blue-400 scale-105' : 'ring-red-100'}`}>
                                <img src="https://picsum.photos/200/200?grayscale" alt="Coach" className="w-full h-full object-cover opacity-80 mix-blend-multiply" />
                            </div>
                            <Visualizer isActive={sessionState.isSpeaking} />
                         </div>
                     ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                            <span className="text-gray-300 font-semibold text-xs">OFFLINE</span>
                        </div>
                     )}
                </div>

                {/* Coach Text Output - Reduced Font Size */}
                <div className="text-center space-y-4 max-w-2xl min-h-[120px] px-4">
                    {sessionState.isActive && displayCoachText ? (
                         <h2 className="text-xl md:text-2xl font-medium text-gray-800 leading-relaxed tracking-tight animate-fade-in transition-all">
                             "{displayCoachText}"
                         </h2>
                    ) : (
                        <h2 className="text-xl md:text-2xl text-gray-300 font-light">
                            {sessionState.isActive ? "Listening..." : "Start the session to begin your drill."}
                        </h2>
                    )}
                </div>
             </div>

             {/* Background Decoration */}
             <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>
        </main>

        {/* Bottom Status / Controls */}
        <div className="h-20 bg-white border-t border-gray-200 px-6 flex items-center justify-center shrink-0 relative z-20">
             {sessionState.isActive ? (
                <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 rounded-full border border-gray-100 shadow-sm">
                    <div className={`w-2 h-2 rounded-full ${sessionState.isSpeaking ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></div>
                    <span className="text-sm font-medium text-gray-600">
                        {sessionState.isSpeaking ? "Coach is speaking" : "Mic is active - Speak now"}
                    </span>
                    {/* Optional visual cue for user voice could go here */}
                </div>
             ) : (
                 <div className="text-gray-400 text-sm">Session inactive</div>
             )}
        </div>

        {/* User Camera Overlay (PIP) */}
        <div className="absolute bottom-24 right-6 w-48 h-36 rounded-lg shadow-2xl z-30 overflow-hidden ring-1 ring-white/20">
            <UserCamera />
        </div>
      </div>

      {/* Right Panel - Transcript */}
      <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col hidden lg:flex">
         <div className="h-16 border-b border-gray-200 flex items-center px-4 bg-white shrink-0">
             <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Transcript</span>
         </div>
         <div className="flex-1 overflow-hidden relative">
             <div className="absolute inset-0">
                 {/* Pass combined history + current live text to transcript */}
                 <Transcript 
                    messages={[
                        ...messages, 
                        ...(currentTranscript ? [{
                            id: 'current',
                            speaker: currentTranscript.speaker,
                            text: currentTranscript.text,
                            timestamp: Date.now()
                        }] : [])
                    ]} 
                 />
             </div>
         </div>
      </div>
    </div>
  );
}
