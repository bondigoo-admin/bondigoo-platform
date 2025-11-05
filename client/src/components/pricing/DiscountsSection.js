// --- START OF FILE DiscountsSection.js ---

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { Info, Tag, ChevronDown, ChevronRight, Plus, MoreVertical, Edit, Trash2, Check, Calendar, ShoppingCart, Key, Percent, Banknote, Gift, Sparkles, UserCheck, Clock, ShieldAlert, ArrowUpDown } from 'lucide-react';
import { nanoid } from 'nanoid';
import { format } from 'date-fns';
import { de, fr, it, enUS } from 'date-fns/locale';

// UI Components
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '../ui/dropdown-menu.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Switch } from '../ui/switch.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.jsx";
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Badge } from '../ui/badge.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip.tsx';
import { Calendar as DatePickerCalendar } from '../ui/calendar.jsx';
import { MultiSelect } from '../ui/multi-select.tsx';
import { Checkbox } from '../ui/checkbox.tsx';

// API and Utils
import { getCoachDiscounts, createDiscount, updateDiscount, deleteDiscount } from '../../services/discountAPI';
import { logger } from '../../utils/logger';
import { cn } from '../../lib/utils';

const ALLOWED_SESSION_TYPE_IDS = ['66ec4ea477bec414bf2b8859', '66ec54f94a8965b22af33fd9'];

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
    minimumPurchaseAmount: { amount: null, currency: 'CHF' },
    eligibility: { type: 'all', entityIds: [] },
};

// --- HELPER COMPONENT FOR TABLE PILLS ---

const InfoPill = ({ icon, text, tooltipText, variant = "secondary", className = "" }) => (
    <TooltipProvider delayDuration={100}>
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="inline-flex"> 
                    <Badge variant={variant} className={cn("flex items-center gap-1.5 whitespace-nowrap", className)}>
                        {icon}
                        <span className="truncate max-w-[150px] sm:max-w-none">{text}</span>
                    </Badge>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltipText}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);


// --- MAIN COMPONENT ---

const DiscountsSection = ({ userId, sessionTypes, programs, getTranslatedSessionTypeName }) => {
    //console.log('--- [DiscountsSection] Component Render ---');
    const { t } = useTranslation(['coachSettings', 'common']);
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingDiscount, setEditingDiscount] = useState(null);

    const [sorting, setSorting] = useState([]);
    const [columnFilters, setColumnFilters] = useState([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [columnSizing, setColumnSizing] = useState({});

const { data: discounts, isLoading, isError } = useQuery(
        ['discounts', userId],
        () => getCoachDiscounts(userId),
        { 
            enabled: !!userId,
            onError: (error) => {
                logger.error('[DiscountsSection] Failed to fetch discounts', { error, userId });
                toast.error(t('errorFetchingDiscounts'));
            }
        }
    );

    useEffect(() => {
        //console.log(`%c[DiscountsSection] isDialogOpen state changed to: ${isDialogOpen}`, 'color: blue; font-weight: bold;');
        if (!isDialogOpen) {
            //console.log('[DiscountsSection] Dialog is closing. Setting timer to clear editingDiscount.');
            const timer = setTimeout(() => {
                //console.log('%c[DiscountsSection] Timer finished. Clearing editingDiscount state.', 'color: red; font-weight: bold;');
                setEditingDiscount(null);
            }, 150);
            return () => {
                //console.log('[DiscountsSection] Cleanup for isDialogOpen effect. Clearing timer.');
                clearTimeout(timer);
            };
        } else {
             //console.log('[DiscountsSection] Dialog is opening.');
        }
    }, [isDialogOpen]);

    useEffect(() => {
        //console.log(`%c[DiscountsSection] editingDiscount state updated to:`, 'color: green; font-weight: bold;', editingDiscount);
    }, [editingDiscount]);


    const mutationOptions = (action) => ({
        onSuccess: () => {
            queryClient.invalidateQueries(['discounts', userId]);
            toast.success(t(`discount${action}Success`));
            //console.log(`[DiscountsSection] Mutation (${action}) succeeded. Closing dialog.`);
            setIsDialogOpen(false);
        },
        onError: (error) => {
            const errorMessage = error.response?.data?.message || error.message || t('common:errorTryAgain');
            toast.error(errorMessage);
            logger.error(`[DiscountsSection] Mutation failed: ${errorMessage}`, { error });
        },
    });

    const createMutation = useMutation(createDiscount, mutationOptions('Created'));
    const updateMutation = useMutation(({ id, data }) => updateDiscount(id, data), mutationOptions('Updated'));
    const deleteMutation = useMutation((discountId) => deleteDiscount(discountId), mutationOptions('Deleted'));

const handleFormSubmit = (data) => {
        //console.log('[DiscountsSection] handleFormSubmit called with data:', data);
        const payload = { ...data };
        if (payload.usageLimit === '') payload.usageLimit = null;
        
        if (payload.minimumPurchaseAmount && payload.minimumPurchaseAmount.amount === null) {
            payload.minimumPurchaseAmount = null;
        }

        if (editingDiscount) {
            updateMutation.mutate({ id: editingDiscount._id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleToggleStatus = (discount) => {
        updateMutation.mutate({ id: discount._id, data: { isActive: !discount.isActive } });
    };
    
    const handleDelete = (discountId) => {
        if (window.confirm(t('common:areYouSureDelete'))) {
            deleteMutation.mutate(discountId);
        }
    };

    const handleOpenDialog = (discount = null) => {
        //console.log('[DiscountsSection] handleOpenDialog called. Setting editingDiscount and opening dialog. Discount:', discount);
        setEditingDiscount(discount);
        setIsDialogOpen(true);
    }
    
    const handleCloseDialog = () => {
        //console.log('[DiscountsSection] handleCloseDialog called. Closing dialog.');
        setIsDialogOpen(false);
    }

    const scopeOptions = useMemo(() => [
        { value: 'platform_wide', label: t('scope.platform_wide', 'All Offerings') },
        { value: 'all_programs', label: t('scope.all_programs', 'All Programs') },
        { value: 'specific_programs', label: t('scope.specific_programs', 'Specific Programs') },
        { value: 'all_sessions', label: t('scope.all_sessions', 'All Sessions') },
        { value: 'specific_session_types', label: t('scope.specific_session_types', 'Specific Session Types') },
    ], [t]);

    const entityOptions = useMemo(() => {
        const liveSessionEntityType = {
            value: '66ec54ee4a8965b22af33fd1',
            label: t('scope.live_session', 'Live Session')
        };

        const scheduledSessionTypes = sessionTypes
            ?.filter(st => ALLOWED_SESSION_TYPE_IDS.includes(st.id))
            .map(st => ({ value: st.id, label: getTranslatedSessionTypeName(st.id) })) || [];
    
        return {
            programs: programs?.map(p => ({ value: p._id, label: p.title })) || [],
            sessionTypes: [liveSessionEntityType, ...scheduledSessionTypes],
        };
    }, [programs, sessionTypes, getTranslatedSessionTypeName, t]);
    
    const getScopeLabel = useCallback((scopeValue) => {
        return scopeOptions.find(o => o.value === scopeValue)?.label || scopeValue;
    }, [scopeOptions]);

    const getDiscountDateStatus = useCallback((discount) => {
        const now = new Date();
        const start = discount.startDate ? new Date(discount.startDate) : null;
        const end = discount.expiryDate ? new Date(discount.expiryDate) : null;
        
        const formatDateShort = (date) => date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        const formatDateTime = (date) => date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (end && end < now) {
            return {
                text: t('pills.expired', 'Expired'),
                tooltip: t('pills.expiredOn', 'Expired on {{date}}', { date: formatDateTime(end) }),
                icon: <ShieldAlert className="h-3.5 w-3.5" />,
                variant: 'destructive',
            };
        }
        if (start && start > now) {
            return {
                text: t('pills.starts', 'Starts {{date}}', { date: formatDateShort(start) }),
                tooltip: t('pills.startsOn', 'Starts on {{date}}', { date: formatDateTime(start) }),
                icon: <Clock className="h-3.5 w-3.5" />,
            };
        }
        if (start || end) {
            let text = t('pills.activeNoLimit', 'Active');
            let tooltip = t('pills.activeNoLimitTooltip', 'Active with no date limit');

            if (start && end) {
                text = `${formatDateShort(start)} - ${formatDateShort(end)}`;
                tooltip = t('pills.activeBetween', 'Active from {{start}} to {{end}}', { start: formatDateTime(start), end: formatDateTime(end) });
            } else if (start) {
                text = t('pills.from', 'From {{date}}', { date: formatDateShort(start) });
                tooltip = t('pills.activeFrom', 'Active since {{start}}', { start: formatDateTime(start) });
            } else if (end) {
                text = t('pills.until', 'Until {{date}}', { date: formatDateShort(end) });
                tooltip = t('pills.activeUntil', 'Active until {{end}}', { end: formatDateTime(end) });
            }
            return { text, tooltip, icon: <Calendar className="h-3.5 w-3.5" /> };
        }
        return null;
    }, [t]);

    const getAppliedItems = useCallback((discount) => {
        if (discount.appliesTo.scope === 'specific_programs') {
            return discount.appliesTo.entityIds.map(id => entityOptions.programs.find(p => p.value === id)?.label).filter(Boolean);
        }
        if (discount.appliesTo.scope === 'specific_session_types') {
            return discount.appliesTo.entityIds.map(id => entityOptions.sessionTypes.find(s => s.value === id)?.label).filter(Boolean);
        }
        return [];
    }, [entityOptions]);

    const columns = useMemo(() => [
    {
        accessorKey: "code",
        header: ({ column }) => (
            <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                {t('table.code')}
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => {
            const discount = row.original;
            return (
                <div className='flex flex-col items-start gap-1'>
                    <Badge variant="secondary" className="font-mono text-sm">{discount.code}</Badge>
                    {discount.isAutomatic && <Badge variant="outline" className="border-blue-500 text-blue-500">{t('form.automatic')}</Badge>}
                </div>
            );
        },
        minSize: 180,
    },
    {
        accessorKey: "value",
        header: ({ column }) => (
            <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                {t('table.value')}
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => {
            const discount = row.original;
            return discount.type === 'percent' ? `${discount.value}%` : `${discount.value} CHF`;
        },
        minSize: 120,
    },
    {
        id: "conditions",
        header: () => <span>{t('table.conditions', 'Conditions & Limits')}</span>,
        cell: ({ row }) => {
            const discount = row.original;
            const dateStatus = getDiscountDateStatus(discount);
            const appliedItems = getAppliedItems(discount);
            const scopeLabel = getScopeLabel(discount.appliesTo.scope);

            return (
                <div className="flex flex-wrap items-center gap-2 max-w-lg">
                    <InfoPill
                        icon={<ShoppingCart className="h-3.5 w-3.5" />}
                        text={scopeLabel}
                        tooltipText={
                            appliedItems.length > 0
                                ? `${scopeLabel}: ${appliedItems.join(', ')}`
                                : t('pills.scopeTooltip', 'This discount applies to {{scope}}', { scope: scopeLabel.toLowerCase() })
                        }
                    />
                    {dateStatus && <InfoPill icon={dateStatus.icon} text={dateStatus.text} tooltipText={dateStatus.tooltip} variant={dateStatus.variant || 'secondary'} />}
                    {discount.minimumPurchaseAmount?.amount > 0 && <InfoPill icon={<Banknote className="h-3.5 w-3.5" />} text={t('pills.minPurchase', 'Min. {{amount}} {{currency}}', { amount: discount.minimumPurchaseAmount.amount, currency: discount.minimumPurchaseAmount.currency })} tooltipText={t('pills.minPurchaseTooltip', 'Applies to orders over {{amount}} {{currency}}', { amount: discount.minimumPurchaseAmount.amount, currency: discount.minimumPurchaseAmount.currency })} />}
                    {discount.usageLimit > 0 && <InfoPill icon={<Key className="h-3.5 w-3.5" />} text={t('pills.totalUses', '{{count}} uses', { count: discount.usageLimit })} tooltipText={t('pills.totalUsesTooltip', 'Can be used {{count}} times in total', { count: discount.usageLimit })} />}
                    {discount.limitToOnePerCustomer && <InfoPill icon={<UserCheck className="h-3.5 w-3.5" />} text={t('pills.onePerCustomer', '1 per customer')} tooltipText={t('pills.onePerCustomerTooltip', 'Each customer can only use this discount once')} />}
                </div>
            );
        },
        minSize: 400,
    },
    {
        accessorKey: "isActive",
        header: ({ column }) => (
            <div className="text-center">
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    {t('table.status')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            </div>
        ),
        cell: ({ row }) => {
             const discount = row.original;
             return (
                <div className="flex justify-center">
                     <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Checkbox
                                    checked={discount.isActive}
                                    onCheckedChange={() => handleToggleStatus(discount)}
                                    disabled={updateMutation.isLoading && updateMutation.variables?.id === discount._id}
                                    aria-label={t('table.status')}
                                />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{discount.isActive ? t('common:active') : t('common:inactive')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
             );
        },
        size: 100,
    },
    {
        id: "actions",
        header: () => <div className="text-right">{t('common:actions')}</div>,
        cell: ({ row }) => {
            const discount = row.original;
            return (
                <div className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('common:openMenu')}</span>
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleOpenDialog(discount)}>
                                <Edit className="mr-2 h-4 w-4" />
                                <span>{t('common:edit')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => handleDelete(discount._id)} disabled={deleteMutation.isLoading && deleteMutation.variables === discount._id}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>{t('common:delete')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            );
        },
        size: 80,
    },
], [t, getAppliedItems, getDiscountDateStatus, getScopeLabel, handleToggleStatus, handleOpenDialog, handleDelete, updateMutation.isLoading, updateMutation.variables, deleteMutation.isLoading, deleteMutation.variables]);

const table = useReactTable({
    data: discounts || [],
    columns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    state: {
        sorting,
        columnFilters,
        columnVisibility,
        columnSizing,
    },
});
    
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
                        <Tag className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <span>{t('discountsTitle')}</span>
                        {!isLoading && discounts?.length > 0 && (
                            <Badge variant="secondary">{discounts.length}</Badge>
                        )}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info size={16} className=" text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('discountsSubtitle')}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </CardTitle>
                </div>
                {expanded ? < ChevronDown className="h-5 w-5 text-muted-foreground" /> : < ChevronRight className="h-5 w-5 text-muted-foreground" />}
            </CardHeader>

             {expanded && (
                <CardContent className="pt-0">
                    <div className="flex justify-end mb-4">
                         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={() => handleOpenDialog()}>
                                    <Plus className="mr-2 h-4 w-4" /> {t('createDiscount')}
                                </Button>
                            </DialogTrigger>
                         <DialogContent
                            onPointerDownOutside={(e) => {
                                if (
                                    e.target.closest('[data-radix-popper-content-wrapper]')
                                ) {
                                    e.preventDefault();
                                }
                            }}
                            draggable
                            fullscreenable
                            resizable
                            className="max-w-md md:max-w-3xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0"
                         >
                            <DialogHeader
                                  data-dialog-drag-handle="true"
                                  className="cursor-move border-b px-4 sm:px-6 py-4 shrink-0 pr-20"
                                >
                                  <DialogTitle className="text-xl">
                                    {editingDiscount ? t('editDiscount') : t('createDiscount')}
                                  </DialogTitle>
                                  <DialogDescription>{t('createDiscountDesc')}</DialogDescription>
                                </DialogHeader>
                                <DiscountForm
                                    key={editingDiscount?._id || 'new'}
                                    onSubmit={handleFormSubmit}
                                    initialData={editingDiscount}
                                    onClose={handleCloseDialog}
                                    scopeOptions={scopeOptions}
                                    entityOptions={entityOptions}
                                    isLoading={createMutation.isLoading || updateMutation.isLoading}
                                    userId={userId}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                    
                    <div className="rounded-md border">
                        <div className="overflow-x-auto">
                                                      <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map(headerGroup => (
                                        <TableRow key={headerGroup.id}>
                                            {headerGroup.headers.map(header => (
                                                <TableHead key={header.id} style={{ width: header.getSize() }}>
                                                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={columns.length} className="text-center h-24">{t('common:loading')}</TableCell></TableRow>
                                    ) : isError ? (
                                        <TableRow><TableCell colSpan={columns.length} className="text-center h-24 text-destructive">{t('errorFetchingDiscounts')}</TableCell></TableRow>
                                    ) : table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map(row => (
                                            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                                {row.getVisibleCells().map(cell => (
                                                    <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">{t('noDiscounts')}</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
};

// --- FORM COMPONENT (Unchanged) ---

const DiscountForm = ({ onSubmit, initialData, onClose, scopeOptions, entityOptions, isLoading, userId }) => {
    const { t, i18n } = useTranslation(['coachSettings', 'common']);
    
    const locales = {
        de,
        fr,
        it,
        en: enUS,
    };
    const dateFnsLocale = locales[i18n.language] || enUS;
    
    const [formData, setFormData] = useState(() => JSON.parse(JSON.stringify(initialData || DEFAULT_FORM_DATA)));
    const [errors, setErrors] = useState({});
    const [isTimeRestricted, setIsTimeRestricted] = useState(false);

    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    const [datePickerRange, setDatePickerRange] = useState();
    const [pickerStartTime, setPickerStartTime] = useState('00:00');
    const [pickerEndTime, setPickerEndTime] = useState('23:59');
    
    useEffect(() => {
        //console.log('[DiscountForm] MOUNTED. initialData:', initialData);
        return () => {
            //console.log('[DiscountForm] UNMOUNTING.');
        };
    }, []);

    const generateCode = () => handleFieldChange('code', nanoid(8).toUpperCase());

    useEffect(() => {
        const data = initialData ? JSON.parse(JSON.stringify(initialData)) : JSON.parse(JSON.stringify(DEFAULT_FORM_DATA));
        data.appliesTo = { ...DEFAULT_FORM_DATA.appliesTo, ...(data.appliesTo || {}) };
        data.eligibility = { ...DEFAULT_FORM_DATA.eligibility, ...(data.eligibility || {}) };
        data.appliesTo.entityIds = data.appliesTo.entityIds || [];
        data.eligibility.entityIds = data.eligibility.entityIds || [];
        data.limitToOnePerCustomer = data.limitToOnePerCustomer ?? false;
        data.isAutomatic = data.isAutomatic ?? false;
        
        if (typeof data.minimumPurchaseAmount !== 'object' || data.minimumPurchaseAmount === null) {
            data.minimumPurchaseAmount = { amount: data.minimumPurchaseAmount, currency: 'CHF' };
        }
        
        setFormData(data);
        setErrors({});
        setIsTimeRestricted(!!(data.startDate || data.expiryDate));
    }, [initialData]);

    useEffect(() => {
        if (isDatePopoverOpen) {
            setDatePickerRange({
                from: formData.startDate ? new Date(formData.startDate) : undefined,
                to: formData.expiryDate ? new Date(formData.expiryDate) : undefined,
            });
            setPickerStartTime(formData.startDate ? format(new Date(formData.startDate), 'HH:mm') : '00:00');
            setPickerEndTime(formData.expiryDate ? format(new Date(formData.expiryDate), 'HH:mm') : '23:59');
        }
    }, [isDatePopoverOpen, formData.startDate, formData.expiryDate]);

    const handleApplyDateRange = () => {
        if (datePickerRange?.from) {
            const fromWithTime = new Date(datePickerRange.from);
            const [fromH, fromM] = pickerStartTime.split(':').map(Number);
            fromWithTime.setHours(fromH, fromM, 0, 0);
            handleFieldChange('startDate', fromWithTime.toISOString());
        } else {
            handleFieldChange('startDate', null);
        }

        const effectiveToDate = datePickerRange?.to || datePickerRange?.from;
        if (effectiveToDate) {
            const toWithTime = new Date(effectiveToDate);
            const [toH, toM] = pickerEndTime.split(':').map(Number);
            toWithTime.setHours(toH, toM, 59, 999);
            handleFieldChange('expiryDate', toWithTime.toISOString());
        } else {
             handleFieldChange('expiryDate', null);
        }
        setIsDatePopoverOpen(false);
    };

    const handleFieldChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({...prev, [field]: null}));
    };

    const handleNestedFieldChange = useCallback((parent, field, value) => {
        setFormData(prev => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));
        const fieldName = (parent === 'appliesTo' || parent === 'eligibility') && field === 'entityIds' ? 'entityIds' : field;
        if (errors[fieldName]) {
            setErrors(prev => ({...prev, [fieldName]: null}));
        }
    }, [errors]);

    const validate = () => {
        const newErrors = {};
        const { code, type, value, appliesTo, isAutomatic, minimumPurchaseAmount, usageLimit } = formData;
        if (!isAutomatic) {
            if (!code.trim()) newErrors.code = t('validation.codeRequired');
            else if (code.length < 3) newErrors.code = t('validation.codeMin');
            else if (code.length > 20) newErrors.code = t('validation.codeMax');
            else if (!/^[a-zA-Z0-9-]+$/.test(code)) newErrors.code = t('validation.codeAlphanumeric');
        }
        if (value === undefined || value === null || value <= 0) newErrors.value = t('validation.valueMin');
        else if (type === 'percent' && value > 100) newErrors.value = t('validation.percentMax');
        if (minimumPurchaseAmount?.amount !== null && minimumPurchaseAmount?.amount < 0) newErrors.minimumPurchaseAmount = t('validation.minPurchaseAmountPositive');
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
            const finalData = { ...formData, coach: userId };
            onSubmit(finalData);
        } else {
            toast.error(t('common:validationError'));
        }
    };
    
    return (
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-3 space-y-6">
                        <Card>
<CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base"><Gift size={18} />{t('form.discountMethod')}</CardTitle>
                            </CardHeader>
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
                <Input id="code" value={formData.code} onChange={e => handleFieldChange('code', e.target.value.toUpperCase())} className="uppercase font-mono" placeholder="SUMMER-25" disabled={!!initialData} />
                {!initialData && <Button type="button" variant="outline" onClick={generateCode}><Sparkles className="h-4 w-4 mr-2" />{t('common:generate')}</Button>}
            </div>
            {errors.code && <p className="text-sm text-destructive mt-1">{errors.code}</p>}
        </div>
    ) : (
        <div className="space-y-2">
            <Label htmlFor="code">{t('form.automaticTitle')}</Label>
            <Input id="code" value={formData.code} onChange={e => handleFieldChange('code', e.target.value)} placeholder={t('form.automaticTitlePlaceholder')} />
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
        <div className="flex items-center justify-between">
            <Label htmlFor="minimumPurchaseAmount" className="shrink-0 pr-4">{t('form.minPurchase')}</Label>
            <div className="flex items-center">
                <Input
                    id="minimumPurchaseAmount"
                    type="number"
                    variant="compact"
                    position="left"
                    placeholder="0.00"
                    value={formData.minimumPurchaseAmount?.amount || ''}
                    onChange={e => handleFieldChange('minimumPurchaseAmount', { ...(formData.minimumPurchaseAmount || {currency: 'CHF'}), amount: e.target.value ? parseFloat(e.target.value) : null })}
                    min="0"
                    step="0.01"
                    className="w-28"
                />
                <Select
                    value={formData.minimumPurchaseAmount?.currency || 'CHF'}
                    onValueChange={value => handleFieldChange('minimumPurchaseAmount', { ...(formData.minimumPurchaseAmount || {amount: null}), currency: value })}
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
        </div>
        {errors.minimumPurchaseAmount && <p className="text-sm text-destructive mt-1">{errors.minimumPurchaseAmount}</p>}
    </div>

   <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center space-x-3">
          <Switch 
            id="isTimeRestricted" 
            checked={isTimeRestricted} 
            onCheckedChange={(checked) => {
                setIsTimeRestricted(checked);
                if (!checked) {
                    handleFieldChange('startDate', null);
                    handleFieldChange('expiryDate', null);
                }
            }} 
        />
            <Label htmlFor="isTimeRestricted" className="font-normal">{t('form.setTimeRestriction', 'Set active dates')}</Label>
        </div>
        {isTimeRestricted && (
            <div className="space-y-2">
               
                <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen} modal={true}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !formData.startDate && "text-muted-foreground"
                            )}
                        >
                            <Calendar className="mr-2 h-4 w-4" />
                            {formData.startDate && formData.expiryDate ? (
                              <span className="truncate text-xs">
                                {format(new Date(formData.startDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })} - {format(new Date(formData.expiryDate), "MMM d, y, HH:mm", { locale: dateFnsLocale })}
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
                                    <Label htmlFor="start-time" className="text-sm font-medium">{t('form.startTime', 'Start Time')}</Label>
                                    <Input id="start-time" type="time" value={pickerStartTime} onChange={(e) => setPickerStartTime(e.target.value)} />
                                </div>
                                <div>
                                    <Label htmlFor="end-time" className="text-sm font-medium">{t('form.expiryTime', 'End Time')}</Label>
                                    <Input id="end-time" type="time" value={pickerEndTime} onChange={(e) => setPickerEndTime(e.target.value)} />
                                </div>
                            </div>
                            <Button onClick={handleApplyDateRange} className="w-full mt-4">{t('common:apply', 'Apply')}</Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        )}
    </div>
</CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart size={18} />{t('table.scope')}</CardTitle>
                                <CardDescription>{t('form.scopeDesc')}</CardDescription>
                            </CardHeader>
                           <CardContent className="space-y-4">
                                                                                                <Select onValueChange={value => { handleNestedFieldChange('appliesTo', 'scope', value); handleNestedFieldChange('appliesTo', 'entityIds', []); }} value={formData.appliesTo.scope}>
                            <SelectTrigger><SelectValue placeholder={t('selectScope')} /></SelectTrigger>
                            <SelectContent>{scopeOptions.map(option => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}</SelectContent>
                        </Select>
                        {formData.appliesTo.scope === 'specific_programs' && (
                            <MultiSelect selected={formData.appliesTo.entityIds} onChange={value => handleNestedFieldChange('appliesTo', 'entityIds', value)} options={entityOptions.programs} placeholder={t('form.selectPrograms', 'Select programs...')} />
                        )}
                        {formData.appliesTo.scope === 'specific_session_types' && (
                            <MultiSelect selected={formData.appliesTo.entityIds} onChange={value => handleNestedFieldChange('appliesTo', 'entityIds', value)} options={entityOptions.sessionTypes} placeholder={t('form.selectSessionTypes', 'Select session types...')} />
                        )}
                        {errors.entityIds && <p className="text-sm text-destructive mt-1">{errors.entityIds}</p>}
                        </CardContent>
                        </Card>
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="hidden lg:block">
    <DiscountSummary formData={formData} scopeOptions={scopeOptions} entityOptions={entityOptions} />
</div>

                       

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert size={18} />{t('form.usageLimits')}</CardTitle>
                            </CardHeader>
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


// --- SUMMARY COMPONENT (Unchanged) ---

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

export default DiscountsSection;