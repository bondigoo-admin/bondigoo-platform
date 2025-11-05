import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus, Edit, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { usePricingData } from '../../hooks/usePricingData';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { de, fr, it, enUS } from 'date-fns/locale';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { MultiSelect } from '../ui/multi-select.tsx'; // Assumed from guide component
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Label } from '../ui/label.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Calendar as DatePickerCalendar } from '../ui/calendar.jsx';
import { DeleteButton } from './SharedPricingComponents';
import { Badge } from '../ui/badge.tsx';

const ALLOWED_SESSION_TYPE_IDS = ['66ec4ea477bec414bf2b8859', '66ec54f94a8965b22af33fd9'];

const DEFAULT_SPECIAL_PERIOD = {
  name: '',
  description: '',
  sessionTypes: [],
  rate: {
    amount: '',
    type: 'percentage'
  },
  startDate: '',
  endDate: ''
};

const SpecialPeriodsSection = ({ userId, sessionTypes, getTranslatedSessionTypeName }) => {
  const { t, i18n } = useTranslation(['common', 'coachSettings']);

  const locales = {
      de,
      fr,
      it,
      en: enUS,
  };
  const dateFnsLocale = locales[i18n.language] || enUS;
  
const { 
    priceConfig,
    addSpecialPeriod,
    updateSpecialPeriod,
    removeSpecialPeriod,
    isAddingSpecialPeriod,
    isUpdatingSpecialPeriod,
    isRemovingSpecialPeriod,
    isLoading: isDataLoading
  } = usePricingData(userId);

  const [expanded, setExpanded] = useState(false);
  const [newPeriod, setNewPeriod] = useState(DEFAULT_SPECIAL_PERIOD);
  const [validationErrors, setValidationErrors] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [editingValidationErrors, setEditingValidationErrors] = useState({});

  const [isAddingPopoverOpen, setIsAddingPopoverOpen] = useState(false);
  const [isEditingPopoverOpen, setIsEditingPopoverOpen] = useState(false);
  const [datePickerRange, setDatePickerRange] = useState();
  const [pickerStartTime, setPickerStartTime] = useState('00:00');
  const [pickerEndTime, setPickerEndTime] = useState('23:59');

  useEffect(() => {
    if (isAddingPopoverOpen) {
        setDatePickerRange({
            from: newPeriod.startDate ? new Date(newPeriod.startDate) : undefined,
            to: newPeriod.endDate ? new Date(newPeriod.endDate) : undefined,
        });
        setPickerStartTime(newPeriod.startDate ? format(new Date(newPeriod.startDate), 'HH:mm') : '00:00');
        setPickerEndTime(newPeriod.endDate ? format(new Date(newPeriod.endDate), 'HH:mm') : '23:59');
    }
  }, [isAddingPopoverOpen, newPeriod.startDate, newPeriod.endDate]);

  useEffect(() => {
    if (isEditingPopoverOpen && editingPeriod) {
        setDatePickerRange({
            from: editingPeriod.startDate ? new Date(editingPeriod.startDate) : undefined,
            to: editingPeriod.endDate ? new Date(editingPeriod.endDate) : undefined,
        });
        setPickerStartTime(editingPeriod.startDate ? format(new Date(editingPeriod.startDate), 'HH:mm') : '00:00');
        setPickerEndTime(editingPeriod.endDate ? format(new Date(editingPeriod.endDate), 'HH:mm') : '23:59');
    }
  }, [isEditingPopoverOpen, editingPeriod]);

   const handleApplyDateRange = (updateFn) => {
    let startDateISO = null;
    let endDateISO = null;

    if (datePickerRange?.from) {
        const fromWithTime = new Date(datePickerRange.from);
        const [fromH, fromM] = pickerStartTime.split(':').map(Number);
        fromWithTime.setHours(fromH, fromM, 0, 0);
        startDateISO = fromWithTime.toISOString();
    }

    const effectiveToDate = datePickerRange?.to || datePickerRange?.from;
    if (effectiveToDate) {
        const toWithTime = new Date(effectiveToDate);
        const [toH, toM] = pickerEndTime.split(':').map(Number);
        toWithTime.setHours(toH, toM, 59, 999);
        endDateISO = toWithTime.toISOString();
    }
    
    updateFn(prev => ({ ...prev, startDate: startDateISO, endDate: endDateISO }));

    if (isAddingPopoverOpen) setIsAddingPopoverOpen(false);
    if (isEditingPopoverOpen) setIsEditingPopoverOpen(false);
  };

const validatePeriod = useCallback((data, isEditing = false) => {
    const errors = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!data.name?.trim()) errors.name = t('coachSettings:nameRequired');
    if (!data.sessionTypes?.length) errors.sessionTypes = t('coachSettings:selectAtLeastOneSessionType');
    
    if (!data.startDate || !data.endDate) {
        errors.dateRange = t('coachSettings:dateRangeRequired', 'A start and end date are required');
    } else if (new Date(data.startDate) >= new Date(data.endDate)) {
        errors.dateRange = t('coachSettings:invalidDateRange');
    } else if (!isEditing && new Date(data.startDate) < today) {
        errors.dateRange = t('coachSettings:startDateMustBeFuture');
    }

    if (data.rate.amount === '' || data.rate.amount === null) {
        errors.rate = t('coachSettings:discountRequired');
    } else if (Number(data.rate.amount) <= 0 || Number(data.rate.amount) > 100) {
        errors.rate = t('coachSettings:invalidDiscountRange');
    }

    if (data.startDate && data.endDate && data.sessionTypes.length > 0) {
        const newStart = new Date(data.startDate);
        const newEnd = new Date(data.endDate);

        const isOverlapping = priceConfig?.specialPeriods?.some(existingPeriod => {
            if (isEditing && existingPeriod._id === data._id) {
                return false; 
            }
            
            const hasCommonSessionType = existingPeriod.sessionTypes.some(st => data.sessionTypes.includes(st));
            if (!hasCommonSessionType) {
                return false;
            }

            const existingStart = new Date(existingPeriod.startDate);
            const existingEnd = new Date(existingPeriod.endDate);

            return (newStart < existingEnd && newEnd > existingStart);
        });

        if (isOverlapping) {
            errors.overlap = t('coachSettings:errorOverlappingPeriod', 'This period overlaps with an existing one for the same session type.');
        }
    }
    
    return errors;
  }, [t, priceConfig?.specialPeriods]);

  const handleDelete = useCallback(async (periodId) => {
    try {
      await removeSpecialPeriod(periodId);
      toast.success(t('coachSettings:specialPeriodDeleted'));
    } catch (error) {
      toast.error(t('coachSettings:errorDeletingSpecialPeriod'));
    }
  }, [removeSpecialPeriod, t]);

  const handleAddNewPeriod = useCallback(() => {
    const errors = validatePeriod(newPeriod, false);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    addSpecialPeriod(newPeriod, {
      onSuccess: () => {
        setNewPeriod(DEFAULT_SPECIAL_PERIOD);
        setValidationErrors({});
        setIsAdding(false);
        toast.success(t('coachSettings:specialPeriodAdded'));
      },
      onError: () => {
        toast.error(t('coachSettings:errorAddingSpecialPeriod'));
      }
    });
  }, [newPeriod, addSpecialPeriod, validatePeriod, t]);

 const handleUpdatePeriod = useCallback(() => {
    if (!editingPeriod) return;

    const errors = validatePeriod(editingPeriod, true);
    if (Object.keys(errors).length > 0) {
      setEditingValidationErrors(errors);
      return;
    }

    setEditingValidationErrors({});

    updateSpecialPeriod(
      { 
        periodId: editingPeriod._id, 
        data: { ...editingPeriod, rate: { ...editingPeriod.rate, amount: Number(editingPeriod.rate.amount) }}
      }, 
      { 
        onSuccess: () => {
          setEditingPeriod(null);
          toast.success(t('coachSettings:specialPeriodUpdated', 'Special period updated'));
        },
        onError: () => {
          toast.error(t('coachSettings:errorUpdatingSpecialPeriod', 'Error updating special period'));
        }
      }
    );
  }, [editingPeriod, updateSpecialPeriod, validatePeriod, t]);

  const sessionTypeOptions = sessionTypes
    .filter(type => ALLOWED_SESSION_TYPE_IDS.includes(type.id))
    .map(type => ({ value: type.id, label: getTranslatedSessionTypeName(type.id) }));
    
  const handleCancelAdd = () => {
      setIsAdding(false);
      setNewPeriod(DEFAULT_SPECIAL_PERIOD);
      setValidationErrors({});
  };

  const getCombinedError = (errors) => Object.values(errors)[0];

  const periods = priceConfig?.specialPeriods || [];
  const hasPeriods = periods.length > 0;

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
                <Calendar className="h-5 w-5" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
                <span>{t('coachSettings:specialPeriods')}</span>
                 {!isDataLoading && hasPeriods && (
                    <Badge variant="secondary">{periods.length}</Badge>
                )}
                <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <Info size={16} className=" text-muted-foreground" />
                </TooltipTrigger><TooltipContent>
                    <p className="max-w-xs">{t('coachSettings:specialPeriodsNote', 'Create special pricing for holidays, vacations, or promotional periods.')}</p>
                </TooltipContent></Tooltip></TooltipProvider>
            </CardTitle>
        </div>
        {expanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
            <div className="space-y-3">
                {isDataLoading ? (
                    <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
                ) : (
                   periods.map((period) => (
                    (editingPeriod && editingPeriod._id === period._id)
                   ? <div key={period._id} className="mt-4 p-4 border rounded-lg bg-muted/50 dark:bg-muted/20 space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5"><label className="text-sm font-medium">{t('coachSettings:periodName')}</label><Input variant="compact" value={editingPeriod.name} onChange={(e) => setEditingPeriod(p => ({...p, name: e.target.value }))} /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">{t('coachSettings:discountPercentage')}</label><div className="relative"><Input variant="compact"  type="number" value={editingPeriod.rate.amount} onChange={(e) => setEditingPeriod(p => ({...p, rate: { ...p.rate, amount: e.target.value }}))} min="1" max="100" step="0.1" className="pr-8" /><span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span></div></div>
        <div className="md:col-span-2 space-y-1.5"><label className="text-sm font-medium">{t('coachSettings:periodDescription')}</label><Textarea value={editingPeriod.description} onChange={(e) => setEditingPeriod(p => ({...p, description: e.target.value }))} rows="2" /></div>
        <div className="md:col-span-2 space-y-1.5"><label className="text-sm font-medium">{t('coachSettings:sessionTypes')}</label><MultiSelect selected={editingPeriod.sessionTypes} onChange={(v) => setEditingPeriod(p => ({...p, sessionTypes: v }))} options={sessionTypeOptions} /></div>
        <div className="md:col-span-2 space-y-1.5">
            <Label>{t('coachSettings:activeDates', 'Active Dates')}</Label>
            <Popover open={isEditingPopoverOpen} onOpenChange={setIsEditingPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="input" className={cn("w-full justify-start text-left font-normal", !editingPeriod.startDate && "text-muted-foreground")}>
                        <Calendar className="mr-2 h-4 w-4" />
                        {editingPeriod.startDate && editingPeriod.endDate ? (
                            <span className="truncate text-xs">
                                {format(new Date(editingPeriod.startDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })} - {format(new Date(editingPeriod.endDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })}
                            </span>
                        ) : (
                            <span>{t('common:selectDateRange', 'Select Date Range')}</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <DatePickerCalendar
                        initialFocus
                        mode="range"
                        locale={dateFnsLocale}
                        defaultMonth={datePickerRange?.from}
                        selected={datePickerRange}
                        onSelect={setDatePickerRange}
                        numberOfMonths={2}
                    />
                    <div className="p-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="edit-start-time" className="text-sm font-medium">{t('coachSettings:startTime', 'Start Time')}</Label>
                                <Input id="edit-start-time" type="time" value={pickerStartTime} onChange={(e) => setPickerStartTime(e.target.value)} />
                            </div>
                            <div>
                                <Label htmlFor="edit-end-time" className="text-sm font-medium">{t('coachSettings:endTime', 'End Time')}</Label>
                                <Input id="edit-end-time" type="time" value={pickerEndTime} onChange={(e) => setPickerEndTime(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={() => handleApplyDateRange(setEditingPeriod)} className="w-full mt-4">{t('common:apply', 'Apply')}</Button>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    </div>
    {Object.keys(editingValidationErrors).length > 0 && (
        <p className="text-sm text-destructive">{getCombinedError(editingValidationErrors)}</p>
    )}
    <div className="flex items-center justify-end gap-2">
        <Button onClick={() => { setEditingPeriod(null); setEditingValidationErrors({}); }} variant="outline" disabled={isUpdatingSpecialPeriod}>{t('common:cancel')}</Button>
        <Button onClick={handleUpdatePeriod} disabled={isUpdatingSpecialPeriod}>{isUpdatingSpecialPeriod ? t('common:saving') : t('common:save')}</Button>
    </div>
  </div>
                    : <div key={period._id} className="flex items-start justify-between p-3 border rounded-md bg-background hover:bg-muted/50">
                            <div className="flex flex-col gap-1.5 text-sm">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">{period.name}</h4>
                                </div>
                                {period.description && <p className="text-muted-foreground">{period.description}</p>}
                                <p className="text-muted-foreground">
                                    <strong>{period.rate.amount}%</strong> {t('common:discountFor').toLowerCase()} {period.sessionTypes.map(typeId => getTranslatedSessionTypeName(typeId)).join(', ')}
                                </p>
                               <p className="text-xs text-muted-foreground/80">{format(new Date(period.startDate), 'P', { locale: dateFnsLocale })} - {format(new Date(period.endDate), 'P', { locale: dateFnsLocale })}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setEditingPeriod(period)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger><TooltipContent><p>{t('common:edit')}</p></TooltipContent></Tooltip></TooltipProvider>
                                <DeleteButton onDelete={() => handleDelete(period._id)} disabled={isRemovingSpecialPeriod} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isAdding ? (
                <div className="mt-4 p-4 border rounded-lg bg-muted/50 dark:bg-muted/20 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:periodName')}</label>
                            <Input variant="compact"  value={newPeriod.name} onChange={(e) => setNewPeriod(prev => ({...prev, name: e.target.value }))} placeholder={t('coachSettings:periodNamePlaceholder')} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:discountPercentage')}</label>
                            <div className="relative">
                                <Input variant="compact" type="number" value={newPeriod.rate.amount} onChange={(e) => setNewPeriod(prev => ({...prev, rate: { ...prev.rate, amount: Number(e.target.value) }}))} min="1" max="100" step="0.1" placeholder="e.g. 15" className="pr-8" />
                                <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                            </div>
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:periodDescription')} ({t('common:optional')})</label>
                            <Textarea value={newPeriod.description} onChange={(e) => setNewPeriod(prev => ({...prev, description: e.target.value }))} placeholder={t('coachSettings:periodDescriptionPlaceholder')} rows="2" />
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:sessionTypes')}</label>
                            <MultiSelect selected={newPeriod.sessionTypes} onChange={(value) => setNewPeriod(prev => ({...prev, sessionTypes: value }))} options={sessionTypeOptions} placeholder={t('coachSettings:selectSessionTypes')} />
                        </div>
                      <div className="md:col-span-2 space-y-1.5">
    <Label>{t('coachSettings:activeDates', 'Active Dates')}</Label>
    <Popover open={isAddingPopoverOpen} onOpenChange={setIsAddingPopoverOpen}>
        <PopoverTrigger asChild>
            <Button variant="input" className={cn("w-full justify-start text-left font-normal", !newPeriod.startDate && "text-muted-foreground")}>
                <Calendar className="mr-2 h-4 w-4" />
                {newPeriod.startDate && newPeriod.endDate ? (
                    <span className="truncate text-xs">
                        {format(new Date(newPeriod.startDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })} - {format(new Date(newPeriod.endDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })}
                    </span>
                ) : (
                    <span>{t('common:selectDateRange', 'Select Date Range')}</span>
                )}
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
            <DatePickerCalendar
                initialFocus
                mode="range"
                locale={dateFnsLocale}
                defaultMonth={datePickerRange?.from}
                selected={datePickerRange}
                onSelect={setDatePickerRange}
                numberOfMonths={2}
            />
            <div className="p-4 border-t border-border">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="add-start-time" className="text-sm font-medium">{t('coachSettings:startTime', 'Start Time')}</Label>
                        <Input id="add-start-time" type="time" value={pickerStartTime} onChange={(e) => setPickerStartTime(e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="add-end-time" className="text-sm font-medium">{t('coachSettings:endTime', 'End Time')}</Label>
                        <Input id="add-end-time" type="time" value={pickerEndTime} onChange={(e) => setPickerEndTime(e.target.value)} />
                    </div>
                </div>
                <Button onClick={() => handleApplyDateRange(setNewPeriod)} className="w-full mt-4">{t('common:apply', 'Apply')}</Button>
            </div>
        </PopoverContent>
    </Popover>
</div>
                    </div>
                    {Object.keys(validationErrors).length > 0 && ( <p className="text-sm text-destructive">{getCombinedError(validationErrors)}</p> )}
                    <div className="flex items-center justify-end gap-2">
                        <Button onClick={handleCancelAdd} variant="outline" disabled={isAddingSpecialPeriod}>{t('common:cancel')}</Button>
                        <Button onClick={handleAddNewPeriod} disabled={isAddingSpecialPeriod}>{isAddingSpecialPeriod ? t('common:saving') : t('coachSettings:addSpecialPeriod')}</Button>
                    </div>
                </div>
            ) : (
                <Button onClick={() => setIsAdding(true)} variant="secondary" className="mt-4 w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4"/> {t('coachSettings:addSpecialPeriod')}
                </Button>
            )}
        </CardContent>
      )}
    </Card>
  );
};

export default SpecialPeriodsSection;