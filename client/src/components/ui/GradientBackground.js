import React from 'react';

const GradientBackground = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 h-full w-full">
        <div className="absolute bottom-0 left-[-20%] right-0 top-[-10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--primary)/0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--primary)/0.2),rgba(255,255,255,0))] animate-blob" />
        <div className="animation-delay-2000 absolute bottom-0 right-[-10%] top-[-20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--secondary)/0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--secondary)/0.15),rgba(255,255,255,0))] animate-blob" />
        <div className="animation-delay-4000 absolute bottom-[-20%] left-[20%] right-0 top-0 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--accent)/0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--accent)/0.2),rgba(255,255,255,0))] animate-blob" />
      </div>
    </div>
  );
};

export default GradientBackground;