import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, Check, Edit, Plus, Trash2, ChevronDown, ChevronRight, X, Info } from 'lucide-react';
import { usePricingData } from '../../hooks/usePricingData';
import { toast } from 'react-hot-toast';
import { logger } from '../../utils/logger';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge.tsx';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { DeleteButton } from './SharedPricingComponents';

const ALLOWED_SESSION_TYPE_IDS = ['66ec4ea477bec414bf2b8859', '66ec54f94a8965b22af33fd9'];

const DEFAULT_SESSION_TYPE_RATE = {
  sessionType: null, // This will be an object { value, label }
  rate: {
    amount: '',
    currency: 'CHF'
  }
};

const SessionTypeRatesSection = ({ userId, sessionTypes, getTranslatedSessionTypeName }) => {
  const { t } = useTranslation(['common', 'coachSettings']);
  const { 
    priceConfig,
    updateSessionTypeRate,
    removeSessionTypeRate,  
    isUpdatingSessionType,
    isRemovingSessionType,
    isLoading: isDataLoading
  } = usePricingData(userId);

  const [expanded, setExpanded] = useState(false);
  const [newRate, setNewRate] = useState(DEFAULT_SESSION_TYPE_RATE);
  const [validationError, setValidationError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingRate, setEditingRate] = useState(null);

  useEffect(() => {
    if (!isAdding) {
        setNewRate(DEFAULT_SESSION_TYPE_RATE);
        setValidationError('');
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingRate) {
        setIsAdding(false);
    }
  }, [editingRate]);

  const validateRate = useCallback((data) => {
    if (!data?.rate || data.rate.amount === '' || data.rate.amount === null) {
      return t('coachSettings:rateRequired');
    }
    if (data.rate.amount < 0) {
      return t('coachSettings:rateMustBePositive');
    }
    return '';
  }, [t]);

  const handleDelete = useCallback(async (typeId) => {
    try {
      await removeSessionTypeRate(typeId);
      toast.success(t('coachSettings:rateDeleted'));
    } catch (error) {
      logger.error('[SessionTypeRatesSection] Delete error:', error);
      toast.error(t('coachSettings:errorDeletingRate'));
    }
  }, [removeSessionTypeRate, t]);
  
  const handleAddNewRate = useCallback(async () => {
    const error = validateRate({ ...newRate, rate: { ...newRate.rate, amount: newRate.rate.amount } });
    if (error) {
      setValidationError(error);
      return;
    }
  
    try {
      await updateSessionTypeRate({
        typeId: newRate.sessionType.value,
        rate: {
          amount: Number(newRate.rate.amount),
          currency: newRate.rate.currency
        }
      });
  
      setNewRate(DEFAULT_SESSION_TYPE_RATE);
      setValidationError('');
      setIsAdding(false);
      toast.success(t('coachSettings:rateAdded'));
    } catch (error) {
      toast.error(t('coachSettings:errorAddingRate'));
    }
  }, [newRate, updateSessionTypeRate, validateRate, t]);

  const handleUpdateRate = useCallback(async () => {
    const error = validateRate(editingRate);
    if (error) {
      setValidationError(error);
      return;
    }
    updateSessionTypeRate(
        { typeId: editingRate.sessionType, rate: { amount: Number(editingRate.rate.amount), currency: editingRate.rate.currency } },
        { onSuccess: () => setEditingRate(null) }
    );
  }, [editingRate, updateSessionTypeRate, validateRate, t]);


  const rates = priceConfig?.sessionTypeRates
    ?.filter(rate => rate && rate.sessionType && rate.rate) || [];
  const hasRates = rates.length > 0;

  const availableSessionTypes = sessionTypes
    ?.filter(type => ALLOWED_SESSION_TYPE_IDS.includes(type.id))
    .filter(type => 
    !rates.some(rate => 
      rate.sessionType === type.id
    )
  ) || [];

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewRate(DEFAULT_SESSION_TYPE_RATE);
    setValidationError('');
  };

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
                <Banknote className="h-5 w-5" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
                <span>{t('coachSettings:sessionTypeRates')}</span>
                {!isDataLoading && hasRates && (
                    <Badge variant="secondary">{rates.length}</Badge>
                )}
                <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info size={16} className=" text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs">{t('coachSettings:sessionTypeRatesNote', 'Set individual rates for different session types.')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardTitle>
        </div>
        {expanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
      </CardHeader>
      
       {expanded && (
        <CardContent className="pt-0">
            <div className="space-y-3">
                {isDataLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                    </div>
                ) : (
                  rates.map((rate) => (
                   (editingRate && editingRate.sessionType === rate.sessionType)
                    ? <div key={rate.sessionType} className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                        <p className="text-sm font-medium">{getTranslatedSessionTypeName(rate.sessionType)}:</p>
                        <div className="flex items-center gap-2">
                           <div className="flex items-center">
                                <Input
                                    type="number"
                                    value={editingRate.rate.amount}
                                    onChange={(e) => setEditingRate(prev => ({...prev, rate: {...prev.rate, amount: e.target.value}}))}
                                    min="0"
                                    step="0.01"
                                    className="w-24"
                                    disabled={isUpdatingSessionType}
                                    variant="compact"
                                    position="left"
                                />
                                <Select
                                    value={editingRate.rate.currency}
                                    onValueChange={(value) => setEditingRate(prev => ({...prev, rate: {...prev.rate, currency: value}}))}
                                    disabled={isUpdatingSessionType}
                                >
                                    <SelectTrigger className="w-20" position="right">
                                        <SelectValue/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CHF">CHF</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                </Select>
                           </div>
                           <Button size="icon" variant="ghost" onClick={handleUpdateRate} disabled={isUpdatingSessionType}>
                                <Check className="h-4 w-4"/>
                           </Button>
                           <Button size="icon" variant="ghost" onClick={() => setEditingRate(null)} disabled={isUpdatingSessionType}>
                                <X className="h-4 w-4"/>
                           </Button>
                        </div>
                      </div>
                    : <div key={rate.sessionType} className="flex items-center justify-between p-3 border rounded-md bg-background hover:bg-muted/50">
                            <p className="text-sm">
                                {getTranslatedSessionTypeName(rate.sessionType)}: <strong className="font-semibold">{rate.rate.amount.toFixed(2)} {rate.rate.currency}</strong>
                            </p>
                            <div className="flex items-center gap-1">
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setEditingRate(rate)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger><TooltipContent><p>{t('common:edit')}</p></TooltipContent></Tooltip></TooltipProvider>
                                <DeleteButton onDelete={() => handleDelete(rate.sessionType)} disabled={isRemovingSessionType} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isAdding ? (
                 <div className="mt-4 p-4 border rounded-lg bg-muted/50 dark:bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 md:items-end gap-4 mb-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('coachSettings:sessionType')}</label>
                            <Select
                                value={newRate.sessionType?.value || ''}
                                onValueChange={(value) => setNewRate(prev => ({...prev, sessionType: { value, label: getTranslatedSessionTypeName(value) }}))}
                            >
                                <SelectTrigger><SelectValue placeholder={t('coachSettings:selectSessionType')} /></SelectTrigger>
                                <SelectContent>
                                    {availableSessionTypes.map(type => (
                                        <SelectItem key={type.id} value={type.id}>{getTranslatedSessionTypeName(type.id)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                             <div className="col-span-2 space-y-1.5">
                                <label className="text-sm font-medium">{t('coachSettings:rate')}</label>
                                <Input
                                    type="number"
                                    variant="compact"
                                    value={newRate.rate.amount}
                                    onChange={(e) => setNewRate(prev => ({...prev, rate: { ...prev.rate, amount: e.target.value }}))}
                                    min="0"
                                    step="0.01"
                                    placeholder={t('coachSettings:enterRate')}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium invisible">{t('common:currency')}</label>
                                <Select
                                    value={newRate.rate.currency}
                                    onValueChange={(value) => setNewRate(prev => ({...prev, rate: { ...prev.rate, currency: value }}))}
                                >
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent><SelectItem value="CHF">CHF</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    {validationError && ( <p className="text-sm text-destructive mb-3">{validationError}</p> )}
                    <div className="flex items-center justify-end gap-2">
                        <Button onClick={handleCancelAdd} variant="outline" disabled={isUpdatingSessionType}>{t('common:cancel')}</Button>
                        <Button onClick={handleAddNewRate} disabled={isUpdatingSessionType}>{isUpdatingSessionType ? t('common:saving') : t('coachSettings:saveRate')}</Button>
                    </div>
                 </div>
            ) : (
                <Button onClick={() => setIsAdding(true)} variant="secondary" className="mt-4 w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4"/> {t('coachSettings:addSessionTypeRate')}
                </Button>
            )}
        </CardContent>
      )}
    </Card>
  );
};

export default SessionTypeRatesSection;