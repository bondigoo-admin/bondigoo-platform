import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Edit, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { usePricingData } from '../../hooks/usePricingData';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { MultiSelect } from '../ui/multi-select.tsx'; // Assumed from guide component
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { DeleteButton } from './SharedPricingComponents';
import { Badge } from '../ui/badge.tsx';

const ALLOWED_SESSION_TYPE_IDS = ['66ec4ea477bec414bf2b8859', '66ec54f94a8965b22af33fd9'];

const DAYS_OF_WEEK = [
  { value: 0, label: 'sunday' }, { value: 1, label: 'monday' },
  { value: 2, label: 'tuesday' }, { value: 3, label: 'wednesday' },
  { value: 4, label: 'thursday' }, { value: 5, label: 'friday' },
  { value: 6, label: 'saturday' }
];

const DEFAULT_TIME_BASED_RATE = {
  sessionTypes: [], dayOfWeek: [],
  timeRange: { start: '09:00', end: '17:00' },
  rate: { amount: '', type: 'percentage' },
  timezone: 'Europe/Zurich'
};

const TimeBasedRatesSection = ({ userId, sessionTypes, getTranslatedSessionTypeName }) => {
  const { t } = useTranslation(['common', 'coachSettings']);
  const { 
    priceConfig, addTimeBasedRate, updateTimeBasedRate, removeTimeBasedRate,
    isAddingTimeBasedRate, isUpdatingTimeBasedRate, isRemovingTimeBasedRate, isLoading: isDataLoading 
  } = usePricingData(userId);

  const [expanded, setExpanded] = useState(false);
  const [newRate, setNewRate] = useState(DEFAULT_TIME_BASED_RATE);
  const [validationErrors, setValidationErrors] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [editingRate, setEditingRate] = useState(null);

  const validateRate = useCallback((data) => {
    const errors = {};
    if (!data.sessionTypes?.length) errors.sessionTypes = t('coachSettings:selectAtLeastOneSessionType');
    if (!data.dayOfWeek?.length) errors.dayOfWeek = t('coachSettings:selectAtLeastOneDay');
    if (data.rate.amount === '' || data.rate.amount === null) errors.rate = t('coachSettings:discountRequired');
    else if (data.rate.amount <= 0 || data.rate.amount > 100) errors.rate = t('coachSettings:invalidDiscountRange');
    if (!data.timeRange.start || !data.timeRange.end) errors.timeRange = t('coachSettings:invalidTimeRange');
    else if (data.timeRange.start >= data.timeRange.end) errors.timeRange = t('coachSettings:endTimeMustBeAfterStart');
    return errors;
  }, [t]);

  const handleDelete = useCallback(async (rateId) => {
    try {
      await removeTimeBasedRate(rateId);
      toast.success(t('coachSettings:timeBasedRateDeleted'));
    } catch (error) {
      toast.error(t('coachSettings:errorDeletingTimeBasedRate'));
    }
  }, [removeTimeBasedRate, t]);

  const handleAddNewRate = useCallback(async () => {
    const errors = validateRate(newRate);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    try {
      await addTimeBasedRate(newRate);
      setNewRate(DEFAULT_TIME_BASED_RATE);
      setValidationErrors({});
      setIsAdding(false);
      toast.success(t('coachSettings:timeBasedRateAdded'));
    } catch (error) {
      toast.error(t('coachSettings:errorAddingTimeBasedRate'));
    }
  }, [newRate, addTimeBasedRate, validateRate, t]);
  
  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewRate(DEFAULT_TIME_BASED_RATE);
    setValidationErrors({});
  };
  const getCombinedError = () => Object.values(validationErrors)[0];

  const sessionTypeOptions = sessionTypes
    .filter(type => ALLOWED_SESSION_TYPE_IDS.includes(type.id))
    .map(type => ({ value: type.id, label: getTranslatedSessionTypeName(type.id) }));
  const dayOptions = DAYS_OF_WEEK.map(day => ({ value: day.value, label: t(`common:${day.label}`) }));

  const rates = priceConfig?.timeBasedRates || [];
  const hasRates = rates.length > 0;

  return (
    <Card className="mt-3">
      <CardHeader 
        className="flex flex-row items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4">
            <div className="flex-shrink-0 grid place-items-center w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
                <Clock className="h-5 w-5" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
                <span>{t('coachSettings:timeBasedRates')}</span>
                {!isDataLoading && hasRates && (
                    <Badge variant="secondary">{rates.length}</Badge>
                )}
                <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <Info size={16} className=" text-muted-foreground" />
                </TooltipTrigger><TooltipContent>
                    <p className="max-w-xs">{t('coachSettings:timeBasedRatesNote', 'Define different rates for various times of day or days of the week.')}</p>
                </TooltipContent></Tooltip></TooltipProvider>
            </CardTitle>
        </div>
        {expanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
      </CardHeader>
      
{expanded && (
        <CardContent className="pt-0">
            <div className="space-y-3">
                {isDataLoading ? (
                    <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                ) : (
                 rates.map((rate) => (
                    (editingRate && editingRate._id === rate._id)
                    ? <div key={rate._id} className="mt-4 p-4 border rounded-lg bg-muted/50 dark:bg-muted/20 space-y-4">
                        <p className="text-sm font-medium">{t('coachSettings:editingTimeBasedRate')}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 space-y-1.5">
                                <label className="text-sm font-medium">{t('coachSettings:sessionTypes')}</label>
                                <MultiSelect selected={editingRate.sessionTypes} onChange={(value) => setEditingRate(prev => ({...prev, sessionTypes: value }))} options={sessionTypeOptions} placeholder={t('coachSettings:selectSessionTypes')} />
                            </div>
                            <div className="md:col-span-2 space-y-1.5">
                                <label className="text-sm font-medium">{t('coachSettings:daysOfWeek')}</label>
                                <MultiSelect selected={editingRate.dayOfWeek} onChange={(value) => setEditingRate(prev => ({...prev, dayOfWeek: value.sort((a,b) => a-b) }))} options={dayOptions} placeholder={t('coachSettings:selectDays')} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5"><label className="text-sm font-medium">{t('common:from')}</label><Input variant="compact" type="time" value={editingRate.timeRange.start} onChange={(e) => setEditingRate(prev => ({...prev, timeRange: { ...prev.timeRange, start: e.target.value }}))} /></div>
                                <div className="space-y-1.5"><label className="text-sm font-medium">{t('common:to')}</label><Input variant="compact" type="time" value={editingRate.timeRange.end} onChange={(e) => setEditingRate(prev => ({...prev, timeRange: { ...prev.timeRange, end: e.target.value }}))} /></div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('coachSettings:discountPercentage')}</label>
                                <div className="relative"><Input variant="compact" type="number" value={editingRate.rate.amount} onChange={(e) => setEditingRate(prev => ({...prev, rate: { ...prev.rate, amount: Number(e.target.value) }}))} min="1" max="100" step="0.1" className="pr-8" /><span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-4">
                            <Button onClick={() => setEditingRate(null)} variant="outline" disabled={isUpdatingTimeBasedRate}>{t('common:cancel')}</Button>
                            <Button onClick={() => updateTimeBasedRate({ rateId: editingRate._id, rateData: editingRate }, { onSuccess: () => setEditingRate(null) })} disabled={isUpdatingTimeBasedRate}>{isUpdatingTimeBasedRate ? t('common:saving') : t('common:save')}</Button>
                        </div>
                      </div>
                    : <div key={rate._id} className="flex items-center justify-between p-3 border rounded-md bg-background hover:bg-muted/50">
                            <p className="text-sm">
                                <strong>{rate.rate.amount}%</strong> {t('common:discountFor').toLowerCase()} {rate.sessionTypes.map(typeId => getTranslatedSessionTypeName(typeId)).join(', ')} on {rate.dayOfWeek.map(day => t(`common:${DAYS_OF_WEEK[day].label}`)).join(', ')} from {rate.timeRange.start} to {rate.timeRange.end}
                            </p>
                            <div className="flex items-center gap-1">
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setEditingRate(rate)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger><TooltipContent><p>{t('common:edit')}</p></TooltipContent></Tooltip></TooltipProvider>
                                <DeleteButton onDelete={() => handleDelete(rate._id)} disabled={isRemovingTimeBasedRate} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isAdding ? (
                <div className="mt-4 p-4 border rounded-lg bg-muted/50 dark:bg-muted/20 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:sessionTypes')}</label>
                            <MultiSelect selected={newRate.sessionTypes} onChange={(value) => setNewRate(prev => ({...prev, sessionTypes: value }))} options={sessionTypeOptions} placeholder={t('coachSettings:selectSessionTypes')} />
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:daysOfWeek')}</label>
                            <MultiSelect selected={newRate.dayOfWeek} onChange={(value) => setNewRate(prev => ({...prev, dayOfWeek: value.sort((a,b) => a-b) }))} options={dayOptions} placeholder={t('coachSettings:selectDays')} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('common:from')}</label>
                                <Input variant="compact" type="time" value={newRate.timeRange.start} onChange={(e) => setNewRate(prev => ({...prev, timeRange: { ...prev.timeRange, start: e.target.value }}))} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('common:to')}</label>
                                <Input variant="compact" type="time" value={newRate.timeRange.end} onChange={(e) => setNewRate(prev => ({...prev, timeRange: { ...prev.timeRange, end: e.target.value }}))} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:discountPercentage')}</label>
                            <div className="relative">
                                <Input variant="compact" type="number" value={newRate.rate.amount} onChange={(e) => setNewRate(prev => ({...prev, rate: { ...prev.rate, amount: Number(e.target.value) }}))} min="1" max="100" step="0.1" placeholder="e.g. 15" className="pr-8" />
                                <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                            </div>
                        </div>
                    </div>
                    {getCombinedError() && ( <p className="text-sm text-destructive">{getCombinedError()}</p> )}
                    <div className="flex items-center justify-end gap-2 pt-4">
                        <Button onClick={handleCancelAdd} variant="outline" disabled={isAddingTimeBasedRate}>{t('common:cancel')}</Button>
                        <Button onClick={handleAddNewRate} disabled={isAddingTimeBasedRate}>{isAddingTimeBasedRate ? t('common:saving') : t('coachSettings:addDiscount')}</Button>
                    </div>
                </div>
            ) : (
                <Button onClick={() => setIsAdding(true)} variant="secondary" className="mt-4 w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4"/> {t('coachSettings:addTimeBasedDiscount')}
                </Button>
            )}

        </CardContent>
      )}
    </Card>
  );
};

export default TimeBasedRatesSection;