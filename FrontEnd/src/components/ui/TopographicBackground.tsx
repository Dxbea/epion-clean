import React from 'react';
import './TopographicBackground.css';

export default function TopographicBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#FAFAF5] dark:bg-[#0b0c0c] pointer-events-none">
      {/* 
        The container is larger than the screen so that the animated distortion 
        doesn't show cut-off edges.
      */}
      <div className="topo-wrapper absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] sm:w-[150vh] sm:h-[150vh]">
        <div className="topo-container w-full h-full"></div>
      </div>

      {/* Bottom gradient fade-out to ensure readability of content if needed */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#FAFAF5] to-transparent dark:from-[#0b0c0c]"></div>

      {/* SVG Filter Definition for the topographic distortion */}
      <svg className="absolute w-0 h-0 pointer-events-none">
        <filter id="topo-distortion" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0025"
            numOctaves="3"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              values="0.0025;0.0035;0.0025"
              dur="45s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="250"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </div>
  );
}
