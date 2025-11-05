import React, { useState, useEffect, useRef } from 'react';
import { Clock as ClockIcon } from 'lucide-react';
import { logger } from '../utils/logger';

const OvertimeTimer = ({ actualEndTime, isPaidOvertimeActive = false, sessionId = 'unknown' }) => {
    const [remainingTime, setRemainingTime] = useState(null);
    const intervalRef = useRef(null);

    useEffect(() => {
        const calculateRemaining = () => {
            // Ensure actualEndTime is valid before proceeding
            if (!actualEndTime || isNaN(new Date(actualEndTime).getTime())) {
                logger.warn('[OvertimeTimer] calculateRemaining skipped: Invalid actualEndTime', { sessionId, actualEndTime });
                setRemainingTime(null);
                return null;
            }
            if (!isPaidOvertimeActive) {
                 logger.debug('[OvertimeTimer] calculateRemaining skipped: Paid overtime not active', { sessionId });
                setRemainingTime(null);
                return null;
            }

            const endTimeMs = new Date(actualEndTime).getTime();
            const nowMs = Date.now();
            const diffSeconds = Math.max(0, Math.floor((endTimeMs - nowMs) / 1000));

            // Log calculated difference
            logger.debug('[OvertimeTimer] Calculated remaining time', { sessionId, endTimeMs, nowMs, diffSeconds });

            setRemainingTime(diffSeconds);
            return diffSeconds;
        };

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
             logger.debug('[OvertimeTimer] Cleared existing interval due to dependency change', { sessionId, actualEndTime, isPaidOvertimeActive });
        }

        const initialRemaining = calculateRemaining();
        logger.info('[OvertimeTimer] useEffect triggered', { sessionId, actualEndTime, isPaidOvertimeActive, initialRemaining });

        if (isPaidOvertimeActive && actualEndTime && !isNaN(new Date(actualEndTime).getTime()) && initialRemaining !== null && initialRemaining > 0) {
             logger.info('[OvertimeTimer] Starting timer interval', { sessionId, actualEndTimeISO: new Date(actualEndTime).toISOString(), initialRemaining });
            intervalRef.current = setInterval(() => {
                setRemainingTime(prev => {
                    // Add logging inside interval
                    const nextValue = prev !== null ? prev - 1 : 0;
                    // logger.trace('[OvertimeTimer] Interval tick', { sessionId, prev, nextValue }); // Use trace for frequent logs
                    if (prev === null || prev <= 1) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                         logger.info('[OvertimeTimer] Timer reached zero or became invalid, stopping interval', { sessionId });
                        return 0;
                    }
                    return nextValue;
                });
            }, 1000);
        } else if (isPaidOvertimeActive && initialRemaining === 0) {
             logger.info('[OvertimeTimer] Paid overtime active but remaining time is zero initially.', { sessionId });
        } else {
             logger.debug('[OvertimeTimer] Timer not started (check conditions)', { sessionId, isPaidOvertimeActive, hasValidEndTime: actualEndTime && !isNaN(new Date(actualEndTime).getTime()), initialRemaining });
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                 logger.debug('[OvertimeTimer] Cleaned up timer interval on unmount/deps change', { sessionId });
            }
        };
    }, [actualEndTime, isPaidOvertimeActive, sessionId]);

    if (remainingTime === null || !isPaidOvertimeActive) {
        return null; // Don't render if not active or time not calculable
    }

    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const isUrgent = remainingTime <= 120; // Less than or equal to 2 minutes

    return (
        <div
            className={`absolute top-4 right-4 bg-black bg-opacity-60 px-3 py-1.5 rounded-full shadow-md flex items-center space-x-2 transition-colors duration-300 ${
                isUrgent ? 'text-red-400 animate-pulse' : 'text-white'
            }`}
            title={`Paid overtime ends at ${new Date(actualEndTime).toLocaleTimeString()}`}
        >
            <ClockIcon size={16} className={isUrgent ? 'text-red-500' : 'text-gray-300'} />
            <span className="text-sm font-medium">Paid Overtime: {timeString}</span>
        </div>
    );
};

export default OvertimeTimer;