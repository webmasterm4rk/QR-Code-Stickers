import React, { useEffect, useRef, useState } from 'react';

export type VisualizerState = 'connecting' | 'listening' | 'speaking';

interface LiveVoiceVisualizerProps {
  state: VisualizerState;
}

const LiveVoiceVisualizer: React.FC<LiveVoiceVisualizerProps> = ({ state }) => {
  // If connecting, render the Ripple Animation instead of bars
  if (state === 'connecting') {
    return (
      <div className="relative flex items-center justify-center h-24 w-24">
        {/* Core Dot */}
        <div className="absolute w-4 h-4 bg-blue-600 rounded-full z-10 shadow-lg shadow-blue-500/50"></div>
        
        {/* Ripple Rings - Removed opacity-0 to rely on animation keyframes */}
        <div className="absolute inset-0 border-[3px] border-blue-400 rounded-full animate-ripple" style={{ animationDelay: '0s' }}></div>
        <div className="absolute inset-0 border-[3px] border-blue-400/80 rounded-full animate-ripple" style={{ animationDelay: '0.6s' }}></div>
        <div className="absolute inset-0 border-[3px] border-cyan-400/60 rounded-full animate-ripple" style={{ animationDelay: '1.2s' }}></div>
      </div>
    );
  }

  // --- Audio Bar Animation for Listening/Speaking ---
  
  // 12 bars for the visualizer
  const [bars, setBars] = useState<number[]>(new Array(12).fill(4));
  const requestRef = useRef<number>();
  const timeRef = useRef<number>(0);

  const animate = () => {
    timeRef.current += 0.1; // Increment time for sine waves
    const t = timeRef.current;

    setBars((prevBars) => {
      return prevBars.map((_, i) => {
        let height = 4;

        if (state === 'listening') {
          // Slow "Breathing" / Thinking wave
          // Gentle undulation
          const wave = Math.sin(t * 0.2 + i * 0.3);
          height = 6 + (wave + 1) * 4; 
        } 
        else if (state === 'speaking') {
          // High energy random spikes + base wave
          // Simulates voice activity
          const noise = Math.random() * 25;
          const base = Math.sin(t * 0.5 + i) * 5;
          height = 8 + Math.max(0, base + noise);
        }

        return height;
      });
    });

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    // Only run the bar animation loop if NOT connecting
    if (state !== 'connecting') {
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [state]);

  // Determine color based on state
  const getBarColor = (height: number) => {
    if (state === 'speaking') return 'bg-blue-600';
    return 'bg-blue-300'; // Listening/Thinking
  };

  return (
    <div className="flex items-center justify-center gap-[4px] h-12 w-full max-w-[200px]">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-colors duration-300 ${getBarColor(height)}`}
          // Use inline style for performant height animation
          style={{ 
            height: `${height}px`,
            transition: 'height 0.1s linear' // Smoothing the frame updates
          }}
        />
      ))}
    </div>
  );
};

export default LiveVoiceVisualizer;