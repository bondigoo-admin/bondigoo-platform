import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Info } from 'lucide-react';
import moment from 'moment';

const TimeSlotPicker = ({
  availableStart,
  availableEnd,
  selectedStart,
  selectedDuration,
  bufferTime = 15,
  standardRate,
  onTimeChange,
  onDurationChange,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
}) => {
  const { t } = useTranslation(['common', 'booking']);
  const [timeline, setTimeline] = useState([]);
  const [price, setPrice] = useState(0);

  // Standard durations in 15-minute intervals
  const durations = [30, 45, 60, 90, 120].filter(duration => {
    const maxPossibleDuration = moment(availableEnd).diff(
      selectedStart || availableStart, 
      'minutes'
    );
    return duration <= maxPossibleDuration;
  });

  // Generate timeline marks
  useEffect(() => {
    const marks = [];
    let current = moment(availableStart);
    const end = moment(availableEnd);
    
    while (current.isBefore(end)) {
      marks.push({
        time: current.toDate(),
        label: current.format('HH:mm'),
        disabled: current.isBefore(moment().add(bufferTime, 'minutes'))
      });
      current.add(15, 'minutes');
    }
    
    setTimeline(marks);
  }, [availableStart, availableEnd, bufferTime]);

  // Calculate price when duration changes
  useEffect(() => {
    if (standardRate && selectedDuration) {
      const hourlyRate = standardRate;
      const hours = selectedDuration / 60;
      setPrice(hourlyRate * hours);
    }
  }, [standardRate, selectedDuration]);

  const handleTimeClick = useCallback((time) => {
    // Ensure we consider buffer time
    const validStartTime = moment(time).isBefore(moment().add(bufferTime, 'minutes'))
      ? moment().add(bufferTime, 'minutes').toDate()
      : time;

    onTimeChange(validStartTime);
  }, [bufferTime, onTimeChange]);

  return (
    <div className="w-full space-y-6">
      {/* Time Selector */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            {t('booking:selectTime')}
          </label>
          <span className="text-xs text-gray-500">
            {moment(availableStart).format('HH:mm')} - {moment(availableEnd).format('HH:mm')}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {timeline.map((mark, index) => (
            <button
              key={index}
              onClick={() => handleTimeClick(mark.time)}
              disabled={mark.disabled}
              className={`
                px-2 py-1 text-sm rounded-md transition-colors
                ${mark.disabled ? 
                  'bg-gray-100 text-gray-400 cursor-not-allowed' :
                  selectedStart && moment(mark.time).isSame(selectedStart) ?
                    'bg-blue-500 text-white' :
                    'bg-white border border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              {mark.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration Selector */}
      <div className="space-y-4">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {t('booking:selectDuration')}
        </label>

        <div className="flex flex-wrap gap-2">
          {durations.map(duration => (
            <button
              key={duration}
              onClick={() => onDurationChange(duration)}
              className={`
                px-4 py-2 text-sm rounded-lg font-medium transition-colors
                ${selectedDuration === duration ?
                  'bg-blue-500 text-white' :
                  'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {duration} {t('booking:minutes')}
            </button>
          ))}
        </div>
      </div>

      {/* Price Display */}
      {standardRate && selectedDuration && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('booking:sessionPrice')}
            </span>
            <span className="text-lg font-semibold">
              {price.toFixed(2)} CHF
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {t('booking:ratePerHour', { rate: standardRate })}
          </div>
        </div>
      )}

      {/* Timezone Info */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Info className="w-3 h-3" />
        <span>{t('booking:timezoneName')}: {timezone}</span>
      </div>

      {/* Selected Time Display */}
      {selectedStart && selectedDuration && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm text-blue-700">
            {moment(selectedStart).format('HH:mm')} - {' '}
            {moment(selectedStart).add(selectedDuration, 'minutes').format('HH:mm')}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeSlotPicker;
