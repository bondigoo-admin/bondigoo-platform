import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Switch } from '../../ui/switch.tsx';

const Step4Services = ({ data, onUpdate }) => {
  const { t } = useTranslation(['onboarding', 'common']);
  const { baseRate, liveSessionRate } = data;

  // If the amount is 0, display an empty string so the placeholder is visible.
  const formatAmountForInput = (amount) => (amount > 0 ? amount.toString() : '');

  const [baseAmountStr, setBaseAmountStr] = useState(formatAmountForInput(baseRate?.amount));
  const [liveAmountStr, setLiveAmountStr] = useState(formatAmountForInput(liveSessionRate?.amount));
  const [isLiveEnabled, setIsLiveEnabled] = useState(liveSessionRate?.amount > 0);

  useEffect(() => {
    // Sync with parent data, but keep the input empty for 0 values.
    setBaseAmountStr(formatAmountForInput(data.baseRate?.amount));
    setLiveAmountStr(formatAmountForInput(data.liveSessionRate?.amount));
    // The switch state is intentionally not synced here to keep it independent from the price input after initialization.
  }, [data.baseRate, data.liveSessionRate]);

  const handleLiveSessionToggle = (enabled) => {
    setIsLiveEnabled(enabled);
    if (!enabled) {
      // When disabling, set the amount to 0 and update the parent.
      setLiveAmountStr('');
      onUpdate('liveSessionRate', { ...liveSessionRate, amount: 0 });
    }
  };

  const handleAmountChange = (key, value, rateData) => {
    // When the input is cleared, '|| 0' ensures we send a valid number (0) to the parent state.
    const amount = parseFloat(value) || 0;
    onUpdate(key, { ...rateData, amount });
  };

  return (
    <div className="space-y-8 pt-4">
      <div className="space-y-2">
        <Label htmlFor="baseRate" className="text-base">{t('step4c.baseRateLabel')}</Label>
        <p className="text-sm text-muted-foreground">{t('step4c.baseRateDescription')}</p>
        <div className="flex items-center gap-2">
          <Input
            id="baseRate"
            type="number"
            value={baseAmountStr}
            onChange={(e) => {
              setBaseAmountStr(e.target.value);
              handleAmountChange('baseRate', e.target.value, baseRate);
            }}
            className="w-32"
            min="0"
            placeholder="0"
          />
          <span className="text-muted-foreground">{t('common:units.perHour', { currency: baseRate.currency })}</span>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="liveSessionToggle" className="text-base">{t('step4c.liveSessionLabel')}</Label>
            <p className="text-sm text-muted-foreground">{t('step4c.liveSessionDescription')}</p>
          </div>
          <Switch
            id="liveSessionToggle"
            checked={isLiveEnabled}
            onCheckedChange={handleLiveSessionToggle}
          />
        </div>
        {isLiveEnabled && (
          <div className="flex items-center gap-2 ">
            <Input
              id="liveSessionRate"
              type="number"
              value={liveAmountStr}
              onChange={(e) => {
                setLiveAmountStr(e.target.value);
                handleAmountChange('liveSessionRate', e.target.value, liveSessionRate);
              }}
              className="w-32"
              min="0"
              placeholder="0"
            />
            <span className="text-muted-foreground">{t('common:units.perMinute', { currency: liveSessionRate.currency })}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step4Services;