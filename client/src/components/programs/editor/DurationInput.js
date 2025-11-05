import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button.tsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { Info, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils'; // Import cn utility

/**
 * A helper function to format minutes into a human-readable string (e.g., 90 -> "1h 30m").
 * @param {number} totalMinutes - The total minutes to format.
 * @returns {string} The formatted time string.
 */
const formatMinutes = (totalMinutes) => {
  if (typeof totalMinutes !== 'number' || isNaN(totalMinutes) || totalMinutes < 0) {
    return '0m';
  }
  if (totalMinutes === 0) {
    return '0m';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  let result = '';
  if (hours > 0) {
    result += `${hours}h`;
  }
  if (minutes > 0) {
    result += `${result ? ' ' : ''}${minutes}m`;
  }
  return result;
};

/**
 * A specialized input component for displaying and overriding calculated duration values.
 * It follows a "Progressive Disclosure" pattern, showing a simple display by default
 * and revealing an input field for manual override upon user interaction.
 *
 * @param {object} props
 * @param {string} props.label - The text for the component's label (e.g., "Content Length").
 * @param {string} props.tooltipText - The help text to display in a tooltip.
 * @param {number} props.calculatedMinutes - The automatically calculated duration in minutes.
 * @param {number} props.userMinutes - The manually entered duration in minutes.
 * @param {boolean} props.isOverridden - A flag indicating if the user has manually set a value.
 * @param {function(number, boolean): void} props.onUpdate - Callback function triggered on change. Passes (newMinutes, newIsOverridden).
 */
const DurationInput = ({
  label,
  tooltipText,
  calculatedMinutes = 0,
  userMinutes = 0,
  isOverridden = false,
  onUpdate
}) => {
  const { t } = useTranslation(['programs', 'common']);
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(isOverridden ? userMinutes : calculatedMinutes);

  useEffect(() => {
    // Sync local state if props change from parent
    const effectiveValue = isOverridden ? userMinutes : calculatedMinutes;
    setCurrentValue(String(effectiveValue)); // Ensure value is a string for the input
  }, [isOverridden, userMinutes, calculatedMinutes]);
  
  const handleBlur = () => {
    const newMinutes = parseInt(currentValue, 10) || 0;
    // An update from editing is always treated as an override.
    onUpdate(newMinutes, true);
    setIsEditing(false);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // Triggers handleBlur
    } else if (e.key === 'Escape') {
      // Revert changes and exit editing mode
      setCurrentValue(String(isOverridden ? userMinutes : calculatedMinutes));
      setIsEditing(false);
    }
  };

  const handleReset = (e) => {
    e.stopPropagation(); // Prevent the click from triggering the edit mode
    onUpdate(calculatedMinutes, false);
  }

  const displayValue = isOverridden ? userMinutes : calculatedMinutes;

return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <Label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {label}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-default" onClick={(e) => e.preventDefault()}>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        {isOverridden && !isEditing && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-primary" onClick={handleReset}>
            {t('common:reset')}
          </Button>
        )}
      </div>

      {isEditing ? (
        <Input
          type="number"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={t('minutes_placeholder', { ns: 'programs' })}
          autoFocus
          className="h-11 text-base text-left"
        />
      ) : (
        <div
          className="flex items-center justify-between px-4 h-11 bg-transparent rounded-lg border border-input hover:border-primary/50 cursor-text transition-colors"
          onClick={() => setIsEditing(true)}
        >
          <p className="text-base font-normal tracking-tight text-foreground">
            {formatMinutes(displayValue)}
          </p>
          {!isOverridden && (
            <span className="text-sm text-muted-foreground">{t('calculated_label', { ns: 'programs' })}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default DurationInput;