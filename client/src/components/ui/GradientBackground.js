import React from 'react';
import { motion } from 'framer-motion';

const blobVariants = {
  animate: {
    transform: [
      "translate(0px, 0px) scale(1)",
      "translate(30px, -50px) scale(1.1)",
      "translate(-20px, 20px) scale(0.9)",
      "translate(0px, 0px) scale(1)",
    ],
  }
};

const transitionProps = {
  duration: 15,
  ease: "easeInOut",
  repeat: Infinity,
  repeatType: "loop",
};

const GradientBackground = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 h-full w-full">
        <motion.div
          variants={blobVariants}
          animate="animate"
          transition={{ ...transitionProps }}
          className="absolute bottom-0 left-[-20%] right-0 top-[-10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--primary)/0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--primary)/0.2),rgba(255,255,255,0))]" 
        />
        <motion.div
          variants={blobVariants}
          animate="animate"
          transition={{ ...transitionProps, delay: 2 }}
          className="absolute bottom-0 right-[-10%] top-[-20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--secondary)/0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--secondary)/0.15),rgba(255,255,255,0))]" 
        />
        <motion.div
          variants={blobVariants}
          animate="animate"
          transition={{ ...transitionProps, delay: 4 }}
          className="absolute bottom-[-20%] left-[20%] right-0 top-0 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle_farthest-side,hsl(var(--accent)/0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_farthest-side,hsl(var(--accent)/0.2),rgba(255,255,255,0))]" 
        />
      </div>
    </div>
  );
};

export default GradientBackground;