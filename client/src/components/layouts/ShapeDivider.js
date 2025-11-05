import React from 'react';
import { motion } from 'framer-motion';

const ShapeDivider = ({ variants }) => {
  return (
    <motion.div
      className="relative w-full h-[100px] sm:h-[150px] lg:h-[200px]"
      variants={variants}
    >
      <div className="absolute inset-0 overflow-hidden">
        <svg
          viewBox="0 0 1440 320"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute block w-full h-full"
          preserveAspectRatio="none"
        >
          <path
            fill="hsl(var(--background))"
            fillOpacity="1"
            d="M0,192L80,170.7C160,149,320,107,480,112C640,117,800,171,960,197.3C1120,224,1280,224,1360,224L1440,224L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          ></path>
        </svg>
      </div>
    </motion.div>
  );
};

export default ShapeDivider;