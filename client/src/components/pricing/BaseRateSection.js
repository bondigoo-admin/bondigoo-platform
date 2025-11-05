import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HandCoins, Check, Edit, Info } from 'lucide-react';
import { usePricingData } from '../../hooks/usePricingData';
import { toast } from 'react-hot-toast';

// UI Components
import { Card, CardContent } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Skeleton } from '../ui/skeleton.jsx';


const BaseRateSection = ({ userId }) => {
  const { t } = useTranslation(['common', 'coachSettings']);
  const {
    priceConfig,
    updateBaseRate,
    isUpdatingBaseRate,
    isLoading: isDataLoading
  } = usePricingData(userId);

  const [editMode, setEditMode] = useState(false);
  const [localBaseRate, setLocalBaseRate] = useState({
    amount: 0,
    currency: 'CHF'
  });

  useEffect(() => {
    if (priceConfig?.baseRate) {
      setLocalBaseRate({
        amount: priceConfig.baseRate.amount || 0,
        currency: priceConfig.baseRate.currency || 'CHF'
      });
    }
  }, [priceConfig]);


  const handleSave = useCallback(async () => {
    try {
      await updateBaseRate(localBaseRate);
      setEditMode(false);
      toast.success(t('coachSettings:baseRateUpdated'));
    } catch (error) {
      toast.error(t('coachSettings:errorSavingBaseRate'));
    }
  }, [localBaseRate, updateBaseRate, t]);

  const handleChange = useCallback((field, value) => {
    setLocalBaseRate(prev => ({
      ...prev,
      [field]: field === 'amount' ? Number(value) : value
    }));
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  }, [handleSave]);

  if (isDataLoading) {
    return (
        <Card>
            <CardContent className="p-6">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-24" />
                        <Skeleton className="h-9 w-9" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
  }

   return (
    <Card>
        <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 grid place-items-center w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
                        <HandCoins className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <span>{t('coachSettings:baseRate')}</span>
                            <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info size={16} className=" text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs">{t('coachSettings:baseRateNote', 'This is the standard hourly rate for your services. Session-specific rates can be set below.')}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </h3>
                         <p className="text-sm text-muted-foreground hidden md:block">
                            {t('coachSettings:baseRateNoteShort', 'Standard hourly rate for your services.')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end">
                    {editMode ? (
                        <>
                            <div className="flex items-center">
                                <Input
                                    type="number"
                                    value={localBaseRate.amount}
                                    onChange={(e) => handleChange('amount', e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    min="0"
                                    step="0.01"
                                    className="w-24"
                                    disabled={isUpdatingBaseRate}
                                    variant="compact"
                                    position="left"
                                />
                                <Select
                                    value={localBaseRate.currency}
                                    onValueChange={(value) => handleChange('currency', value)}
                                    disabled={isUpdatingBaseRate}
                                >
                                    <SelectTrigger className="w-20" position="right">
                                        <SelectValue placeholder="Currency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CHF">CHF</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleSave} variant="ghost" size="icon" disabled={isUpdatingBaseRate} title={t('common:save')}>
                                <Check className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <>
                            <strong className="text-base font-medium whitespace-nowrap">{priceConfig?.baseRate?.amount.toFixed(2)} {priceConfig?.baseRate?.currency}</strong>
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

export default BaseRateSection;