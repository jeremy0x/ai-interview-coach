import React, { useEffect, useRef, useState } from 'react';

const UserCamera: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Camera unavailable");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden shadow-inner border border-gray-700 flex items-center justify-center group">
      {error ? (
        <div className="text-gray-500 text-xs text-center p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            {error}
        </div>
      ) : (
        <>
            <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${streamActive ? 'opacity-100' : 'opacity-0'}`}
            />
            {!streamActive && <div className="absolute inset-0 flex items-center justify-center text-white/20 animate-pulse">Initializing Camera...</div>}
        </>
      )}
      
      {/* Label */}
      <div className="absolute bottom-2 left-3 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white font-medium tracking-wide">
        YOU
      </div>
    </div>
  );
};

export default UserCamera;