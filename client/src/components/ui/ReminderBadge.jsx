import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import moment from 'moment';

const ReminderBadge = ({ startTime, variant = 'default' }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const updateTimeLeft = () => {
      const now = moment();
      const start = moment(startTime);
      const duration = moment.duration(start.diff(now));
      
      if (duration.asMinutes() <= 0) {
        setTimeLeft('Starting now');
        setIsBlinking(true);
        return;
      }

      if (duration.asHours() >= 24) {
        setTimeLeft(start.format('ddd, MMM D [at] HH:mm'));
        setIsBlinking(false);
        return;
      }

      if (duration.asHours() >= 1) {
        setTimeLeft(`${Math.floor(duration.asHours())}h ${duration.minutes()}m`);
        setIsBlinking(false);
        return;
      }

      setTimeLeft(`${duration.minutes()}m`);
      setIsBlinking(duration.asMinutes() <= 15);
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000);
    return () => clearInterval(interval);
  }, [startTime]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`
          inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
          border ${getVariantStyles()}
        `}
      >
        <Clock size={12} className="mr-1" />
        <motion.span
          animate={{
            opacity: isBlinking ? [1, 0.5, 1] : 1
          }}
          transition={{
            duration: 2,
            repeat: isBlinking ? Infinity : 0,
            ease: 'easeInOut'
          }}
        >
          {timeLeft}
        </motion.span>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReminderBadge;