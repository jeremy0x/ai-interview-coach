import React from 'react';

interface VisualizerProps {
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive }) => {
  return (
    <div className="flex items-center justify-center space-x-1 h-8">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1.5 bg-blue-600 rounded-full transition-all duration-300 ease-in-out ${
            isActive ? 'animate-pulse' : 'h-1 opacity-20'
          }`}
          style={{
            height: isActive ? `${Math.random() * 24 + 8}px` : '4px',
            animationDelay: `${i * 0.1}s`,
            animationDuration: '0.6s'
          }}
        />
      ))}
    </div>
  );
};

export default Visualizer;