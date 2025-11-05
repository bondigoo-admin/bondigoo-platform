import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { Check, Calendar, ShoppingCart, Key, Percent, Banknote, Gift, Sparkles } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Switch } from '../ui/switch.tsx';
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.jsx";
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Calendar as DatePickerCalendar } from '../ui/calendar.jsx';
import { MultiSelect } from '../ui/multi-select.tsx';
import { logger } from '../../utils/logger';
import { cn } from '../../lib/utils';
import { DialogFooter } from '../ui/dialog.tsx';

const DEFAULT_FORM_DATA = {
    code: '',
    type: 'percent',
    value: 10,
    appliesTo: { scope: 'platform_wide', entityIds: [] },
    isActive: true,
    isAutomatic: false,
    startDate: null,
    expiryDate: null,
    usageLimit: null,
    limitToOnePerCustomer: false,
    minimumPurchaseAmount: null,
    eligibility: { type: 'all', entityIds: [] },
};

const DiscountSummary = ({ formData, scopeOptions, entityOptions }) => {
    const { t } = useTranslation(['coachSettings', 'common']);

    const summaryLines = useMemo(() => {
        const lines = [];
        const { code, isAutomatic, type, value, appliesTo, startDate, expiryDate, usageLimit, limitToOnePerCustomer, minimumPurchaseAmount } = formData;

        if (!value) return [];

        let typeLine = isAutomatic ? t('summary.autoDiscount') : t('summary.code', { code: (code || '...').toUpperCase() });
        typeLine += `: ${value || 0}${type === 'percent' ? '%' : ' CHF'} ${t('summary.discount')}.`;
        lines.push({ key: 'type', text: typeLine });

        const scopeLabel = scopeOptions.find(o => o.value === appliesTo.scope)?.label || '';
        let scopeText = t('summary.appliesTo', { scope: scopeLabel });
        if (appliesTo.scope === 'specific_programs' && appliesTo.entityIds?.length > 0) scopeText += `: ${appliesTo.entityIds.map(id => (entityOptions.programs.find(p => p.value === id)?.label || entityOptions.sessionTypes.find(s => s.value === id)?.label || id)).join(', ')}`;
        if (appliesTo.scope === 'specific_session_types' && appliesTo.entityIds?.length > 0) scopeText += `: ${appliesTo.entityIds.map(id => (entityOptions.sessionTypes.find(s => s.value === id)?.label || entityOptions.programs.find(p => p.value === id)?.label || id)).join(', ')}`;
        lines.push({ key: 'scope', text: scopeText });

        if (minimumPurchaseAmount && minimumPurchaseAmount > 0) lines.push({ key: 'minPurchase', text: t('summary.minPurchase', { amount: minimumPurchaseAmount }) });

        const limits = [];
        if (usageLimit > 0) limits.push(t('summary.totalUses', { count: usageLimit }));
        if (limitToOnePerCustomer) limits.push(t('summary.onePerCustomer'));
        if (limits.length > 0) lines.push({ key: 'usage', text: `${t('summary.usageLimit')} ${limits.join(', ')}.` });

        lines.push({ key: 'eligibility', text: t('summary.eligibilityAll') });

        if (startDate || expiryDate) {
            if (startDate && expiryDate) lines.push({ key: 'dates', text: t('summary.activeBetween', { start: new Date(startDate).toLocaleString(), end: new Date(expiryDate).toLocaleString() }) });
            else if (startDate) lines.push({ key: 'dates', text: t('summary.activeFrom', { start: new Date(startDate).toLocaleString() }) });
            else if (expiryDate) lines.push({ key: 'dates', text: t('summary.expiresOn', { end: new Date(expiryDate).toLocaleString() }) });
        } else {
            lines.push({ key: 'dates', text: t('summary.noDateLimit') });
        }
        return lines;
    }, [formData, scopeOptions, entityOptions, t]);

    if (summaryLines.length === 0) return (
        <Card className="bg-muted/30 dark:bg-muted/20">
            <CardHeader>
                <CardTitle className="text-base">{t('summary.title')}</CardTitle>
                <CardDescription>{t('summary.noSummary')}</CardDescription>
            </CardHeader>
        </Card>
    );

    return (
        <Card className="bg-muted/50 dark:bg-muted/40">
            <CardHeader>
                <CardTitle className="text-base">{t('summary.title')}</CardTitle>
                <CardDescription>{t('summary.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-2 text-sm text-foreground">
                    {summaryLines.map(line => (
                        <li key={line.key} className="flex items-start gap-3">
                            <Check size={16} className="mt-0.5 text-green-500 flex-shrink-0" />
                            <span className="text-muted-foreground">{line.text}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
};


const DiscountForm = ({ onSubmit, initialData, onClose, scopeOptions, entityOptions, isLoading, coachId: propCoachId, coachOptions }) => {
    const { t } = useTranslation(['coachSettings', 'common', 'admin']);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isTimeRestricted, setIsTimeRestricted] = useState(false);
    const [startPopoverOpen, setStartPopoverOpen] = useState(false);
    const [endPopoverOpen, setEndPopoverOpen] = useState(false);
    
    useEffect(() => {
        logger.info('[DiscountForm] Initializing form data', { hasInitialData: !!initialData, propCoachId });
        const data = initialData ? JSON.parse(JSON.stringify(initialData)) : { ...DEFAULT_FORM_DATA, coach: propCoachId || '' };
        data.appliesTo = { ...DEFAULT_FORM_DATA.appliesTo, ...(data.appliesTo || {}) };
        data.eligibility = { ...DEFAULT_FORM_DATA.eligibility, ...(data.eligibility || {}) };
        data.appliesTo.entityIds = data.appliesTo.entityIds || [];
        data.eligibility.entityIds = data.eligibility.entityIds || [];
        data.limitToOnePerCustomer = data.limitToOnePerCustomer ?? false;
        data.isAutomatic = data.isAutomatic ?? false;
        setFormData(data);
        setErrors({});
        setIsTimeRestricted(!!(data.startDate || data.expiryDate));
    }, [initialData, propCoachId]);

    const handleFieldChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({...prev, [field]: null}));
    };

    const handleNestedFieldChange = useCallback((parent, field, value) => {
        setFormData(prev => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));
        const fieldName = (parent === 'appliesTo' || parent === 'eligibility') && field === 'entityIds' ? 'entityIds' : field;
        if (errors[fieldName]) setErrors(prev => ({...prev, [fieldName]: null}));
    }, [errors]);

    const generateCode = () => handleFieldChange('code', nanoid(8).toUpperCase());

    const validate = () => {
        const newErrors = {};
        const { code, type, value, appliesTo, isAutomatic, minimumPurchaseAmount, usageLimit, coach } = formData;
        if (coachOptions && !coach) newErrors.coach = t('admin:financials.coachIdRequired');
        if (!isAutomatic) {
            if (!code.trim()) newErrors.code = t('validation.codeRequired');
            else if (code.length < 3) newErrors.code = t('validation.codeMin');
            else if (code.length > 20) newErrors.code = t('validation.codeMax');
            else if (!/^[a-zA-Z0-9-]+$/.test(code)) newErrors.code = t('validation.codeAlphanumeric');
        }
        if (value === undefined || value === null || value <= 0) newErrors.value = t('validation.valueMin');
        else if (type === 'percent' && value > 100) newErrors.value = t('validation.percentMax');
        if (minimumPurchaseAmount !== null && minimumPurchaseAmount < 0) newErrors.minimumPurchaseAmount = t('validation.minPurchaseAmountPositive');
        if (usageLimit !== null && usageLimit < 1) newErrors.usageLimit = t('validation.usageLimitPositive');
        if ((appliesTo.scope === 'specific_programs' || appliesTo.scope === 'specific_session_types') && (!appliesTo.entityIds || appliesTo.entityIds.length === 0)) {
            newErrors.entityIds = t('validation.entitiesRequired');
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            const finalData = { ...formData };
            if (propCoachId) finalData.coach = propCoachId;
            onSubmit(finalData);
        } else {
            toast.error(t('common:validationError'));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3 space-y-6">
                         {coachOptions && (
                            <Card>
                                <CardHeader><CardTitle className="flex items-center gap-2 text-base">{t('admin:financials.columns.coach')}</CardTitle></CardHeader>
                                <CardContent>
                                    <Select onValueChange={value => handleFieldChange('coach', value)} value={formData.coach || ''} disabled={!!initialData}>
                                        <SelectTrigger><SelectValue placeholder={t('admin:financials.selectCoach')} /></SelectTrigger>
                                        <SelectContent>
                                            {coachOptions.map(coach => (<SelectItem key={coach.value} value={coach.value}>{coach.label}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                    {errors.coach && <p className="text-sm text-destructive mt-1">{errors.coach}</p>}
                                </CardContent>
                            </Card>
                        )}
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gift size={18} />{t('form.discountMethod')}</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <RadioGroup onValueChange={value => handleFieldChange('isAutomatic', value === 'true')} value={String(formData.isAutomatic)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Label htmlFor="r-code" className="font-normal border rounded-md p-4 flex items-center gap-3 has-[:checked]:bg-accent has-[:checked]:border-primary cursor-pointer transition-colors">
                                        <RadioGroupItem value="false" id="r-code" /> {t('form.discountCode')}
                                    </Label>
                                    <Label htmlFor="r-auto" className="font-normal border rounded-md p-4 flex items-center gap-3 has-[:checked]:bg-accent has-[:checked]:border-primary cursor-pointer transition-colors">
                                        <RadioGroupItem value="true" id="r-auto" /> {t('form.automaticDiscount')}
                                    </Label>
                                </RadioGroup>
                                {!formData.isAutomatic ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="code">{t('table.code')}</Label>
                                        <div className="flex gap-2">
                                            <Input id="code" value={formData.code || ''} onChange={e => handleFieldChange('code', e.target.value.toUpperCase())} className="uppercase font-mono" placeholder="SUMMER-25" disabled={!!initialData} />
                                            {!initialData && <Button type="button" variant="outline" onClick={generateCode}><Sparkles className="h-4 w-4 mr-2" />{t('common:generate')}</Button>}
                                        </div>
                                        {errors.code && <p className="text-sm text-destructive mt-1">{errors.code}</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label htmlFor="code-auto">{t('form.automaticTitle')}</Label>
                                        <Input id="code-auto" value={formData.code || ''} onChange={e => handleFieldChange('code', e.target.value)} placeholder={t('form.automaticTitlePlaceholder')} />
                                        <p className="text-sm text-muted-foreground">{t('form.automaticDesc')}</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className='space-y-2'>
                                        <Label>{t('table.type')}</Label>
                                        <RadioGroup onValueChange={value => handleFieldChange('type', value)} value={formData.type} className="flex items-center gap-4 pt-2">
                                            <div className="flex items-center space-x-2"><RadioGroupItem value="percent" id="r-percent" /><Label htmlFor="r-percent" className="font-normal">{t('type.percent')}</Label></div>
                                            <div className="flex items-center space-x-2"><RadioGroupItem value="fixed" id="r-fixed" /><Label htmlFor="r-fixed" className="font-normal">{t('type.fixed')}</Label></div>
                                        </RadioGroup>
                                    </div>
                                    <div className='space-y-2'>
                                        <Label htmlFor="value">{t('table.value')}</Label>
                                        <div className="relative">
                                            <Input id="value" type="number" value={formData.value || ''} onChange={e => handleFieldChange('value', e.target.valueAsNumber || 0)} step="0.01" min="0" className="pl-12" />
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                {formData.type === 'percent' ? <Percent className="h-4 w-4 text-muted-foreground" /> : <span className="text-muted-foreground text-sm">CHF</span>}
                                            </div>
                                        </div>
                                        {errors.value && <p className="text-sm text-destructive mt-1">{errors.value}</p>}
                                    </div>
                                </div>
                                <div className="space-y-2 pt-4 border-t">
                                    <Label htmlFor="minimumPurchaseAmount">{t('form.minPurchase')}</Label>
                                    <div className="relative">
                                        <Input id="minimumPurchaseAmount" type="number" placeholder="0.00" value={formData.minimumPurchaseAmount || ''} onChange={e => handleFieldChange('minimumPurchaseAmount', e.target.value ? parseFloat(e.target.value) : null)} min="0" step="0.01" className="pl-10"/>
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">CHF</span>
                                    </div>
                                    {errors.minimumPurchaseAmount && <p className="text-sm text-destructive mt-1">{errors.minimumPurchaseAmount}</p>}
                                </div>
                                <div className="space-y-4 pt-4 border-t">
                                    <div className="flex items-center space-x-3">
                                        <Switch id="isTimeRestricted" checked={isTimeRestricted} onCheckedChange={(checked) => {
                                            setIsTimeRestricted(checked);
                                            if (!checked) { handleFieldChange('startDate', null); handleFieldChange('expiryDate', null); }
                                        }} />
                                        <Label htmlFor="isTimeRestricted" className="font-normal">{t('form.setTimeRestriction', 'Set active dates')}</Label>
                                    </div>
                                    {isTimeRestricted && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="startDate">{t('form.startDate')}</Label>
                                                <Popover open={startPopoverOpen} onOpenChange={setStartPopoverOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button id="startDate" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.startDate && "text-muted-foreground")}>
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {formData.startDate ? new Date(formData.startDate).toLocaleDateString() : <span>{t('common:selectDate')}</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0"><DatePickerCalendar mode="single" selected={formData.startDate ? new Date(formData.startDate) : undefined} onSelect={(d) => {handleFieldChange('startDate', d?.toISOString()); setStartPopoverOpen(false);}} initialFocus /></PopoverContent>
                                                </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="expiryDate">{t('form.expiryDate')}</Label>
                                            <Popover open={endPopoverOpen} onOpenChange={setEndPopoverOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button id="expiryDate" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.expiryDate && "text-muted-foreground")}>
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {formData.expiryDate ? new Date(formData.expiryDate).toLocaleDateString() : <span>{t('common:selectDate')}</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0"><DatePickerCalendar mode="single" selected={formData.expiryDate ? new Date(formData.expiryDate) : undefined} onSelect={(d) => {handleFieldChange('expiryDate', d?.toISOString()); setEndPopoverOpen(false);}} disabled={(date) => formData.startDate && date < new Date(formData.startDate)} initialFocus /></PopoverContent>
                                                </Popover>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart size={18} />{t('table.scope')}</CardTitle><CardDescription>{t('form.scopeDesc')}</CardDescription></CardHeader>
                            <CardContent className="space-y-4">
                                <Select onValueChange={value => { handleNestedFieldChange('appliesTo', 'scope', value); handleNestedFieldChange('appliesTo', 'entityIds', []); }} value={formData.appliesTo?.scope}>
                                    <SelectTrigger><SelectValue placeholder={t('selectScope')} /></SelectTrigger>
                                    <SelectContent>{scopeOptions.map(option => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}</SelectContent>
                                </Select>
                                {formData.appliesTo?.scope === 'specific_programs' && (
                                    <MultiSelect selected={formData.appliesTo.entityIds || []} onChange={value => handleNestedFieldChange('appliesTo', 'entityIds', value)} options={entityOptions.programs} placeholder={t('form.selectPrograms', 'Select programs...')} />
                                )}
                                {formData.appliesTo?.scope === 'specific_session_types' && (
                                    <MultiSelect selected={formData.appliesTo.entityIds || []} onChange={value => handleNestedFieldChange('appliesTo', 'entityIds', value)} options={entityOptions.sessionTypes} placeholder={t('form.selectSessionTypes', 'Select session types...')} />
                                )}
                                {errors.entityIds && <p className="text-sm text-destructive mt-1">{errors.entityIds}</p>}
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                        <div className="hidden lg:block">
                            <DiscountSummary formData={formData} scopeOptions={scopeOptions} entityOptions={entityOptions} />
                        </div>
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Key size={18} />{t('form.usageLimits')}</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="usageLimit">{t('form.totalUsesLimit')}</Label>
                                    <Input id="usageLimit" type="number" placeholder={t('form.unlimitedPlaceholder')} value={formData.usageLimit || ''} onChange={e => handleFieldChange('usageLimit', e.target.value ? parseInt(e.target.value, 10) : null)} min="1"/>
                                    {errors.usageLimit && <p className="text-sm text-destructive mt-1">{errors.usageLimit}</p>}
                                </div>
                                <div className="flex items-center space-x-3 rounded-md border p-3">
                                    <Switch id="limitToOnePerCustomer" checked={formData.limitToOnePerCustomer} onCheckedChange={checked => handleFieldChange('limitToOnePerCustomer', checked)} />
                                    <Label htmlFor="limitToOnePerCustomer" className="font-normal">{t('form.limitPerCustomer')}</Label>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
                <div className="mt-6 lg:hidden">
                    <DiscountSummary formData={formData} scopeOptions={scopeOptions} entityOptions={entityOptions} />
                </div>
            </div>
            <DialogFooter className="px-4 py-4 sm:p-6 mt-auto bg-background/95 backdrop-blur-sm sticky bottom-0 border-t">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>{t('common:cancel')}</Button>
                <Button type="submit" disabled={isLoading}>{isLoading ? t('common:saving') : t('common:save')}</Button>
            </DialogFooter>
        </form>
    );
};

export default DiscountForm;