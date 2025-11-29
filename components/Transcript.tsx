import React, { useEffect, useRef } from 'react';
import { Message, Speaker } from '../types';

interface TranscriptProps {
  messages: Message[];
}

const Transcript: React.FC<TranscriptProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-sm">Session transcript will appear here.</p>
        </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 scrollbar-hide">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${
            msg.speaker === Speaker.User ? 'items-end' : 'items-start'
          }`}
        >
          <div
            className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.speaker === Speaker.User
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'
            }`}
          >
            {msg.text}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">
            {msg.speaker}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default Transcript;