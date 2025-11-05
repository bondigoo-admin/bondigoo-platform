import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

const DurationSelector = ({ 
  minDuration,
  maxDuration,
  step,
  defaultDuration,
  allowCustom,
  selectedDuration,
  onChange,
  availableSlotDuration,
  disabled
}) => {
  const { t } = useTranslation(['booking']);
  
  console.log('[DurationSelector] Initializing with:', {
    minDuration,
    maxDuration,
    step,
    defaultDuration,
    allowCustom,
    selectedDuration,
    availableSlotDuration,
    disabled
  });

  // Calculate available durations
  const durations = React.useMemo(() => {
    const maxAllowedDuration = Math.min(maxDuration, availableSlotDuration);
    const durs = [];
    for (let dur = minDuration; dur <= maxAllowedDuration; dur += step) {
      durs.push(dur);
    }
    console.log('[DurationSelector] Calculated available durations:', durs);
    return durs;
  }, [minDuration, maxDuration, step, availableSlotDuration]);

  const handleCustomDurationChange = (e) => {
    const value = parseInt(e.target.value, 10);
    console.log('[DurationSelector] Custom duration changed:', value);
    
    if (isNaN(value)) return;
    
    // Validate the input
    const validatedValue = Math.min(
      Math.max(value, minDuration),
      Math.min(maxDuration, availableSlotDuration)
    );

    if (validatedValue % step !== 0) {
      const roundedValue = Math.round(validatedValue / step) * step;
      console.log('[DurationSelector] Rounding duration to nearest step:', roundedValue);
      onChange(roundedValue);
    } else {
      onChange(validatedValue);
    }
  };

  const handlePresetDurationClick = (duration) => {
    console.log('[DurationSelector] Preset duration selected:', duration);
    onChange(duration);
  };

  return (
    <div className="duration-selector">
      <label className="duration-label">
        <Clock size={16} />
        <span>{t('booking:sessionDuration')}</span>
      </label>
      
      <div className="duration-options">
        {durations.map(duration => (
          <button
            key={duration}
            type="button"
            className={`duration-option ${selectedDuration === duration ? 'selected' : ''}`}
            onClick={() => handlePresetDurationClick(duration)}
            disabled={disabled}
          >
            {duration} {t('common:minutes')}
          </button>
        ))}
        
        {allowCustom && (
          <div className="custom-duration">
            <input
              type="number"
              min={minDuration}
              max={Math.min(maxDuration, availableSlotDuration)}
              step={step}
              value={selectedDuration}
              onChange={handleCustomDurationChange}
              disabled={disabled}
              className="custom-duration-input"
            />
            <span className="duration-unit">{t('common:minutes')}</span>
          </div>
        )}
      </div>

      {availableSlotDuration < maxDuration && (
        <p className="duration-note">
          {t('booking:maxAvailableDuration', { duration: availableSlotDuration })}
        </p>
      )}
    </div>
  );
};

DurationSelector.propTypes = {
  minDuration: PropTypes.number.isRequired,
  maxDuration: PropTypes.number.isRequired,
  step: PropTypes.number.isRequired,
  defaultDuration: PropTypes.number.isRequired,
  allowCustom: PropTypes.bool.isRequired,
  selectedDuration: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  availableSlotDuration: PropTypes.number.isRequired,
  disabled: PropTypes.bool
};

DurationSelector.defaultProps = {
  disabled: false
};

export default DurationSelector;