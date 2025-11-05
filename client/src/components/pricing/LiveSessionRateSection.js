import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Check, Edit, Info } from 'lucide-react';
import { usePricingData } from '../../hooks/usePricingData';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Skeleton } from '../ui/skeleton.jsx';

const LiveSessionRateSection = ({ userId }) => {
  const { t } = useTranslation(['common', 'coachSettings']);
  const { priceConfig, updateLiveSessionRate, isUpdatingLiveSessionRate, isLoading } = usePricingData(userId);

  const [editMode, setEditMode] = useState(false);
  const [localRate, setLocalRate] = useState({ amount: '5', currency: 'CHF' });

  useEffect(() => {
    if (priceConfig?.liveSessionRate) {
      setLocalRate({
        amount: String(priceConfig.liveSessionRate.amount || '5'),
        currency: priceConfig.liveSessionRate.currency || 'CHF'
      });
    }
  }, [priceConfig]);

  const handleSave = useCallback(async () => {
    try {
      const rateToSave = {
        ...localRate,
        amount: parseFloat(localRate.amount) || 0,
      };
      await updateLiveSessionRate(rateToSave);
      setEditMode(false);
      toast.success(t('coachSettings:liveSessionRateUpdated'));
    } catch (error) {
      toast.error(t('coachSettings:errorSavingLiveSessionRate'));
    }
  }, [localRate, updateLiveSessionRate, t]);

  const handleChange = useCallback((field, value) => {
    setLocalRate(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  }, [handleSave]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 grid place-items-center w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <span>{t('coachSettings:liveSessionRate')}</span>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={16} className=" text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{t('coachSettings:liveSessionRateNote', 'Set your per-minute rate for instant live sessions.')}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </h3>
              <p className="text-sm text-muted-foreground hidden md:block">{t('coachSettings:liveSessionRateNoteShort', 'Your per-minute rate for instant sessions.')}</p>
            </div>
          </div>
        <div className="flex items-center justify-end">
            {editMode ? (
              <>
                <div className="flex items-center">
                    <Input
                        type="number"
                        value={localRate.amount}
                        onChange={(e) => handleChange('amount', e.target.value)}
                        onKeyPress={handleKeyPress}
                        min="1"
                        step="0.5"
                        className="w-24"
                        disabled={isUpdatingLiveSessionRate}
                        variant="compact"
                        position="left"
                    />
                    <Select
                        value={localRate.currency}
                        onValueChange={(value) => handleChange('currency', value)}
                        disabled={isUpdatingLiveSessionRate}
                    >
                        <SelectTrigger className="w-20" position="right">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CHF">CHF</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <span className="text-sm text-muted-foreground mx-2">/ min</span>
                <Button onClick={handleSave} variant="ghost" size="icon" disabled={isUpdatingLiveSessionRate} title={t('common:save')}>
                    <Check className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <strong className="text-base font-medium whitespace-nowrap">{Number(priceConfig?.liveSessionRate?.amount || 0).toFixed(2)} {priceConfig?.liveSessionRate?.currency} / min</strong>
                <Button onClick={() => setEditMode(true)} variant="ghost" size="icon" title={t('common:edit')}>
                    <Edit className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveSessionRateSection;