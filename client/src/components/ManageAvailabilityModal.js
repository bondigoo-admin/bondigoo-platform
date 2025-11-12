import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog.tsx';
import { Switch } from './ui/switch.tsx'; 
import { Input } from './ui/input.tsx'
import { Button } from './ui/button.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { useQuery } from 'react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Trash2, Loader, Calendar, Clock, RepeatIcon, Clock2, ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getSessionTypes } from '../services/adminAPI';
import { calculateSessionPrice } from '../services/priceAPI';
import moment from 'moment';
import ErrorBoundary from './ErrorBoundary';
import { logger } from '../utils/logger.js';
import { useCoachSettings } from '../hooks/useCoachSettings';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import 'moment/locale/de';


const getDefaultTime = () => {
  const now = moment();
  const minutes = now.minutes();
  const roundedMinutes = minutes < 30 ? 30 : 60;
  return now.minutes(roundedMinutes).seconds(0).milliseconds(0).toDate();
};

const ManageAvailabilityModal = ({ isOpen, onClose, onSave, onDelete, availabilityData, coachId }) => {
  const { t } = useTranslation(['common', 'manageAvailability']);
  const defaultRecurringEndDate = moment().add(1, 'month').toDate();
  const [formData, setFormData] = useState({
    title: t('manageAvailability:availability'),
    start: getDefaultTime(),
    end: moment(getDefaultTime()).add(1, 'hour').toDate(),
    isAvailability: true,
    recurringPattern: 'none',
    recurringEndDate: defaultRecurringEndDate,
    availableForInstantBooking: false,
    sessionTypeId: '66ec551a4a8965b22af33fe3',
    selectedDates: [],
    isRecurring: false,
     priceOverride: {
      type: 'standard',
      customRatePerHour: { amount: '', currency: 'CHF' },
      allowDiscounts: true
    },
    overtime: {
      allowOvertime: false,
      freeOvertimeDuration: 0,
      paidOvertimeDuration: 0,
      overtimeRate: 0,
    },
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isOvertimeExpanded, setIsOvertimeExpanded] = useState(false);
  const [pricePreview, setPricePreview] = useState({ loading: false, range: null, source: null });

  const dateScrollContainerRef = useRef(null);
  const dateScrollContentRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

    const { data: sessionTypes, isLoading: isLoadingTypes, error: sessionTypesError } = useQuery(
    ['sessionTypes'],
    () => getSessionTypes(),
    {
      enabled: isOpen,
      onError: (error) => {
        logger.error('[ManageAvailabilityModal] Error fetching session types:', error);
        toast.error(t('manageAvailability:errorFetchingSessionTypes'));
      },
    }
  );


  useEffect(() => {
    if (!isOpen) return;

    const updateButtonVisibility = () => {
      const isDesktop = window.innerWidth >= 768;
      setCanScrollPrev(isDesktop);
      setCanScrollNext(isDesktop);
    };

    updateButtonVisibility();
    window.addEventListener('resize', updateButtonVisibility);

    return () => {
      window.removeEventListener('resize', updateButtonVisibility);
    };
  }, [isOpen]);

  const scrollDates = (direction) => {
    const el = dateScrollContainerRef.current;
    if (el) {
      const scrollAmount = el.clientWidth * 0.8;
      el.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);



  // Fetch coach settings to pre-populate overtime defaults
  const { settings: coachSettings, loading: isLoadingSettings } = useCoachSettings(coachId);

   useEffect(() => {
    if (isOpen) {
      setIsOvertimeExpanded(false);

      if (availabilityData && availabilityData._id) {
        // --- EDIT MODE ---
        setIsEditMode(true);
        setFormData({
          ...availabilityData,
          start: new Date(availabilityData.start),
          end: new Date(availabilityData.end),
          recurringEndDate: availabilityData.recurringEndDate ? new Date(availabilityData.recurringEndDate) : defaultRecurringEndDate,
          sessionTypeId: availabilityData.sessionTypeId || '66ec551a4a8965b22af33fe3',
          title: availabilityData.title || t('manageAvailability:availability'),
          selectedDates: availabilityData.selectedDates || [new Date(availabilityData.start)],
          priceOverride: availabilityData.priceOverride || { // Add priceOverride handling
            type: 'standard',
            customRatePerHour: { amount: '', currency: 'CHF' },
            allowDiscounts: true
          },
          overtime: {
            allowOvertime: availabilityData.overtime?.allowOvertime ?? false,
            freeOvertimeDuration: availabilityData.overtime?.freeOvertimeDuration ?? 0,
            paidOvertimeDuration: availabilityData.overtime?.paidOvertimeDuration ?? 0,
            overtimeRate: availabilityData.overtime?.overtimeRate ?? 0,
          },
        });
      } else {
        // --- NEW ITEM MODE ---
        setIsEditMode(false);
        
        const baseStartTime = availabilityData?.start ? new Date(availabilityData.start) : getDefaultTime();
        const baseEndTime = availabilityData?.end ? new Date(availabilityData.end) : moment(baseStartTime).add(1, 'hour').toDate();

        const newFormData = {
          title: t('manageAvailability:availability'),
          start: baseStartTime,
          end: baseEndTime,
          isAvailability: true,
          recurringPattern: 'none',
          recurringEndDate: defaultRecurringEndDate,
          availableForInstantBooking: false,
          sessionTypeId: '66ec551a4a8965b22af33fe3',
          selectedDates: availabilityData?.selectedDates || (availabilityData?.start ? [new Date(availabilityData.start)] : []),
          isRecurring: availabilityData?.isRecurring || false,
          priceOverride: {
            type: 'standard',
            customRatePerHour: { amount: '', currency: 'CHF' },
            allowDiscounts: true
          },
          overtime: {
            allowOvertime: coachSettings?.sessionManagement?.overtime?.allowOvertime ?? false,
            freeOvertimeDuration: coachSettings?.sessionManagement?.overtime?.freeOvertimeDuration ?? 0,
            paidOvertimeDuration: coachSettings?.sessionManagement?.overtime?.paidOvertimeDuration ?? 0,
            overtimeRate: coachSettings?.sessionManagement?.overtime?.overtimeRate ?? 0,
          },
        };
        setFormData(newFormData);
      }
    }
  }, [isOpen, availabilityData, coachSettings, isLoadingSettings, t]);

  useEffect(() => {
    if (!isOpen || formData.priceOverride.type !== 'standard' || !formData.start || !formData.end) {
      setPricePreview({ loading: false, range: null, source: null });
      return;
    }

    const fetchPreview = async () => {
      setPricePreview({ loading: true, range: null, source: null });
      try {
        const durationInMinutes = (new Date(formData.end) - new Date(formData.start)) / 60000;
        if (durationInMinutes <= 0) {
            setPricePreview({ loading: false, range: null, source: null });
            return;
        }

        const startPayload = {
          userId: coachId,
          sessionTypeId: formData.sessionTypeId,
          start: formData.start,
          end: moment(formData.start).add(60, 'minutes').toDate(),
        };

        const endPayload = {
          userId: coachId,
          sessionTypeId: formData.sessionTypeId,
          start: moment(formData.end).subtract(60, 'minutes').toDate(),
          end: formData.end,
        };
        
        const [startPrice, endPrice] = await Promise.all([
          calculateSessionPrice(startPayload),
          calculateSessionPrice(endPayload)
        ]);
        
        const minRate = startPrice?.base?.amount?.amount;
        const maxRate = endPrice?.base?.amount?.amount;
        const baseRateSource = startPrice?._calculationDetails?.baseRateSource;

        let formattedPriceString = t('manageAvailability:priceNotAvailable');
        if (minRate != null && maxRate != null) {
          const currency = startPrice.currency || 'CHF';
          if (Math.abs(minRate - maxRate) < 0.01) {
            formattedPriceString = `${currency} ${minRate.toFixed(2)} / ${t('common:hour')}`;
          } else {
            formattedPriceString = `${currency} ${Math.min(minRate, maxRate).toFixed(2)} - ${Math.max(minRate, maxRate).toFixed(2)} / ${t('common:hour')}`;
          }
        }
        
        setPricePreview({ loading: false, range: formattedPriceString, source: baseRateSource });
      } catch (error) {
        logger.error('Error fetching price preview:', error);
        setPricePreview({ loading: false, range: t('manageAvailability:errorFetchingPrice'), source: null });
      }
    };

    const debounceTimer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(debounceTimer);
  }, [isOpen, formData.start, formData.end, formData.priceOverride.type, coachId, formData.sessionTypeId, t]);

  useEffect(() => {
    logger.info('[ManageAvailabilityModal] Modal lifecycle event', { 
      event: 'mounted', 
      isOpen, 
      coachId, 
      availabilityData: availabilityData?._id || null 
    });
    if (isOpen) {
      logger.info('[ManageAvailabilityModal] Modal opened, checking state', { 
        formData: Object.keys(formData), 
        sessionTypes: sessionTypes?.length || 0 
      });
    }
    return () => {
      logger.info('[ManageAvailabilityModal] Modal lifecycle event', { 
        event: 'unmounted', 
        isOpen, 
        coachId 
      });
    };
  }, [isOpen, coachId, availabilityData, formData, sessionTypes]);

   useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !modalRef.current) return;
      
      const newX = e.clientX - dragStartOffset.x;
      const newY = e.clientY - dragStartOffset.y;
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartOffset]);

  useEffect(() => {
    if (!isOpen) {
      setIsPositionManagedByJS(false); 
    }
  }, [isOpen]);

  useEffect(() => {
    if (modalRef.current) {
      if (isPositionManagedByJS) {
        modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
        modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
        modalRef.current.style.setProperty('transform', 'none', 'important');
        modalRef.current.style.setProperty('margin', '0px', 'important');
      } else {
        // Revert to CSS control by removing properties JS was setting
        modalRef.current.style.removeProperty('top');
        modalRef.current.style.removeProperty('left');
        modalRef.current.style.removeProperty('transform');
        modalRef.current.style.removeProperty('margin');
      }
    }
  }, [isPositionManagedByJS, position]);

 const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    logger.info('[ManageAvailabilityModal] Handling input change', { name, value, type, checked });
    if (name.startsWith('overtime.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        overtime: {
          ...prev.overtime,
          [field]: type === 'checkbox' ? checked : value === '' ? '' : Number(value) || 0,
        },
      }));
    } else if (name.startsWith('priceOverride.')) {
        const fieldPath = name.split('.');
        setFormData(prev => ({
            ...prev,
            priceOverride: {
                ...prev.priceOverride,
                [fieldPath[1]]: fieldPath.length > 2
                    ? { ...prev.priceOverride[fieldPath[1]], [fieldPath[2]]: value }
                    : (type === 'checkbox' ? checked : value)
            }
        }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }));
    }
  }, []);

  const handlePriceOverrideTypeChange = (value) => {
    setFormData(prev => ({
        ...prev,
        priceOverride: {
            ...prev.priceOverride,
            type: value
        }
    }));
  };

  const handleAllowDiscountsChange = (checked) => {
      setFormData(prev => ({
          ...prev,
          priceOverride: {
              ...prev.priceOverride,
              allowDiscounts: checked
          }
      }));
  };

  const handleMouseDownOnTitle = (e) => {
    if (e.button !== 0 || !modalRef.current) return; 

    const modalRect = modalRef.current.getBoundingClientRect();
    
    const currentStartX = isPositionManagedByJS ? position.x : modalRect.left;
    const currentStartY = isPositionManagedByJS ? position.y : modalRect.top;

    if (!isPositionManagedByJS) {
      setPosition({ x: currentStartX, y: currentStartY });
      setIsPositionManagedByJS(true);        
    }
    
    setIsDragging(true);
    setDragStartOffset({
      x: e.clientX - currentStartX, 
      y: e.clientY - currentStartY,
    });
    e.preventDefault();
  };

  const handleTimeChange = (timeString, field) => {
    setFormData(prev => {
      const currentDate = prev[field];
      const [hours, minutes] = timeString.split(':').map(Number);
      const updatedDate = moment(currentDate).hours(hours).minutes(minutes).toDate();
      return {
        ...prev,
        [field]: updatedDate,
        ...(field === 'start' && { end: moment(updatedDate).add(1, 'hour').toDate() }),
      };
    });
  };

  const handleRecurringPatternChange = (pattern) => {
    const baseDate = formData.selectedDates?.[0] || new Date();
    setFormData(prev => ({
      ...prev,
      recurringPattern: pattern,
      selectedDates: [],
    }));

    if (pattern === 'none') return;

    const newDates = new Set();
    const startDate = moment(baseDate);
    const endDate = moment(formData.recurringEndDate || defaultRecurringEndDate);

    let current = startDate.clone();
    while (current.isSameOrBefore(endDate)) {
      newDates.add(current.format('YYYY-MM-DD'));
      switch (pattern) {
        case 'daily': current.add(1, 'day'); break;
        case 'weekly': current.add(1, 'week'); break;
        case 'monthly': current.add(1, 'month'); break;
        default: break;
      }
    }

    const dateObjects = Array.from(newDates).map(dateStr => moment(dateStr).toDate()).sort((a, b) => a - b);
    setFormData(prev => ({ ...prev, selectedDates: dateObjects }));
  };

  const validateForm = () => {
    const errors = {};
    logger.info('[ManageAvailabilityModal] Validating form', { formData });
    if (!formData.selectedDates.length) errors.dates = t('manageAvailability:selectAtLeastOneDate');
    if (!formData.start) errors.start = t('manageAvailability:startTimeRequired');
    if (!formData.end) errors.end = t('manageAvailability:endTimeRequired');
    if (moment(formData.end).isSameOrBefore(moment(formData.start))) {
      errors.end = t('manageAvailability:endTimeAfterStart');
    }
    // Allow empty string or 0 for overtime fields, only check for negative values
    const freeOvertime = formData.overtime.freeOvertimeDuration === '' ? 0 : Number(formData.overtime.freeOvertimeDuration);
    const paidOvertime = formData.overtime.paidOvertimeDuration === '' ? 0 : Number(formData.overtime.paidOvertimeDuration);
    const overtimeRate = formData.overtime.overtimeRate === '' ? 0 : Number(formData.overtime.overtimeRate);
    if (freeOvertime < 0) {
      errors.freeOvertimeDuration = t('manageAvailability:freeOvertimeNonNegative');
    }
    if (paidOvertime < 0) {
      errors.paidOvertimeDuration = t('manageAvailability:paidOvertimeNonNegative');
    }
    if (overtimeRate < 0) {
      errors.overtimeRate = t('manageAvailability:overtimeRateNonNegative');
    }
    setErrors(errors);
    logger.info('[ManageAvailabilityModal] Form validation result', { errors });
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error(t('manageAvailability:formValidationFailed'));
      return;
    }
    setIsSubmitting(true);
    try {
      const startTime = moment(formData.start).format('HH:mm');
      const endTime = moment(formData.end).format('HH:mm');
      const availabilitySlots = formData.selectedDates.map((date) => ({
        ...formData,
        start: moment(date).format(`YYYY-MM-DD ${startTime}`),
        end: moment(date).format(`YYYY-MM-DD ${endTime}`),
        coachId,
        sessionTypeId: formData.sessionTypeId,
        isAvailability: true,
        price: null,
        priceOverride: formData.priceOverride,
        overtime: formData.overtime,
      }));

      await Promise.all(availabilitySlots.map((slot) => onSave(slot)));
      toast.success(t('manageAvailability:availabilitySaved'));
      onClose();
    } catch (error) {
      logger.error('[ManageAvailabilityModal] Error saving availability:', error);
      toast.error(t('manageAvailability:errorSavingAvailability'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateSelection = (date) => {
    const newDate = moment(date).startOf('day');
    setFormData(prev => {
      const selectedDates = prev.selectedDates || [];
      const dateStr = newDate.format('YYYY-MM-DD');
      const isSelected = selectedDates.some(d => moment(d).format('YYYY-MM-DD') === dateStr);
      const newSelectedDates = isSelected
        ? selectedDates.filter(d => moment(d).format('YYYY-MM-DD') !== dateStr)
        : [...selectedDates, newDate.toDate()];
      return {
        ...prev,
        selectedDates: newSelectedDates,
        ...(newSelectedDates.length === 1 && {
          start: moment(newSelectedDates[0]).hours(moment(prev.start).hours()).minutes(moment(prev.start).minutes()).toDate(),
          end: moment(newSelectedDates[0]).hours(moment(prev.end).hours()).minutes(moment(prev.end).minutes()).toDate(),
        }),
      };
    });
  };

  const handleDelete = async () => {
    if (!window.confirm(t('manageAvailability:confirmDelete'))) return;
    try {
      if (availabilityData && availabilityData._id) {
        await onDelete(availabilityData._id);
        toast.success(t('manageAvailability:availabilityDeleted'));
        onClose();
      } else {
        toast.error(t('manageAvailability:cannotDeleteUnsavedAvailability'));
      }
    } catch (error) {
      logger.error('[ManageAvailabilityModal] Error deleting availability:', error);
      toast.error(t('manageAvailability:errorDeletingAvailability'));
    }
  };


  if (isLoadingTypes) return <div>{t('common:loading')}</div>;
  if (sessionTypesError) return <div>{t('manageAvailability:errorLoadingSessionTypes')}</div>;

 return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent ref={modalRef} className="sm:max-w-3xl max-h-[90vh] flex flex-col bg-background" aria-describedby="availability-modal-description">
        <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move flex-shrink-0">
          <DialogTitle className="text-foreground">
            {isEditMode ? t('manageAvailability:editAvailability') : t('manageAvailability:addAvailability')}
          </DialogTitle>
          <DialogDescription id="availability-modal-description" className="sr-only">
            {t('manageAvailability:modalDescription')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pb-6 -mx-6 px-6">
          <form id="availability-form" onSubmit={handleSubmit} className="space-y-4">
           <div className="space-y-2 border-b border-border pb-4">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Calendar size={16} className="text-muted-foreground" />
              {t('manageAvailability:selectDate')}
            </Label>
            <div className="relative">
              <div 
                ref={dateScrollContainerRef}
                className="overflow-x-auto pb-2 -mb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div ref={dateScrollContentRef} className="flex w-max space-x-2">
                  {Array.from({ length: 30 }, (_, i) => moment().add(i, 'days').toDate()).map(date => {
                    const dateStr = moment(date).format('YYYY-MM-DD');
                    const isSelected = formData.selectedDates.some(d => moment(d).format('YYYY-MM-DD') === dateStr);
                    return (
                      <Button
                        key={dateStr}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        className="gap-1 h-auto flex-col p-2 shrink-0 w-12"
                        onClick={() => handleDateSelection(date)}
                      >
                        <span className="text-xs font-medium">{moment(date).format('ddd')}</span>
                        <span className="text-base font-bold">{moment(date).format('D')}</span>
                        <span className="text-xs font-medium">{moment(date).format('MMM')}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

            <AnimatePresence>
                {canScrollPrev && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-1/2 -translate-y-1/2 -left-7 hidden md:block"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted"
                      onClick={() => scrollDates('prev')}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              
             <AnimatePresence>
                {canScrollNext && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-1/2 -translate-y-1/2 -right-6 hidden md:block"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted"
                      onClick={() => scrollDates('next')}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />
            </div>
            {errors.dates && <p className="text-sm text-destructive">{errors.dates}</p>}
          </div>

              <div className="space-y-2 border-b border-border pb-4">
                <Label className="flex items-center gap-2 text-sm font-medium">
                    <Clock size={16} className="text-muted-foreground" />
                    {t('manageAvailability:selectTime')}
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="startTime" className="text-xs font-normal text-muted-foreground">{t('manageAvailability:startTime')}</Label>
                    <Input
                      type="time"
                      id="startTime"
                      variant="compact"
                      value={moment(formData.start).format('HH:mm')}
                      onChange={(e) => handleTimeChange(e.target.value, 'start')}
                    />
                    {errors.start && <p className="text-sm text-destructive">{errors.start}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="endTime" className="text-xs font-normal text-muted-foreground">{t('manageAvailability:endTime')}</Label>
                    <Input
                      type="time"
                      id="endTime"
                      variant="compact"
                      value={moment(formData.end).format('HH:mm')}
                      onChange={(e) => handleTimeChange(e.target.value, 'end')}
                    />
                    {errors.end && <p className="text-sm text-destructive">{errors.end}</p>}
                  </div>
                </div>
              </div>

             <div className="space-y-2 border-b border-border pb-4">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <RepeatIcon size={16} className="text-muted-foreground" />
                  {t('manageAvailability:selectRepeat')}
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    name="recurringPattern"
                    value={formData.recurringPattern}
                    onValueChange={(value) => handleRecurringPatternChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('manageAvailability:selectPattern')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('manageAvailability:selectPattern')}</SelectItem>
                      <SelectItem value="daily">{t('manageAvailability:daily')}</SelectItem>
                      <SelectItem value="weekly">{t('manageAvailability:weekly')}</SelectItem>
                      <SelectItem value="monthly">{t('manageAvailability:monthly')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    name="recurringEndDate"
                    variant="compact"
                    value={moment(formData.recurringEndDate).format('YYYY-MM-DD')}
                    onChange={(e) => handleInputChange({ target: { name: 'recurringEndDate', value: moment(e.target.value).toDate() } })}
                    min={moment().add(1, 'day').format('YYYY-MM-DD')}
                  />
                </div>
              </div>

             <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  {t('manageAvailability:pricing')}
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4 items-start">
                  <Select value={formData.priceOverride.type} onValueChange={handlePriceOverrideTypeChange}>
                    <SelectTrigger className="w-full md:w-[240px]">
                      <SelectValue placeholder={t('manageAvailability:selectPricingType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t('manageAvailability:standardPricing')}</SelectItem>
                      <SelectItem value="custom">{t('manageAvailability:customPrice')}</SelectItem>
                    </SelectContent>
                  </Select>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={formData.priceOverride.type}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="w-full"
                    >
                      {formData.priceOverride.type === 'standard' ? (
                        <div className="border rounded-lg p-2 h-10 flex items-center justify-between bg-muted/20 dark:bg-muted/10 w-full">
                          <div className="flex items-center gap-2 pl-2">
                            <span className="font-semibold text-sm">
                              {pricePreview.loading ? t('common:loading') + '...' : pricePreview.range || `_ / ${t('common:hour')}`}
                            </span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                                    <Info size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">{t('manageAvailability:standardPriceTooltip')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          {pricePreview.source && !pricePreview.loading && (
                            <div className="text-xs font-medium text-muted-foreground bg-background border rounded-full px-2 py-1">
                              {t(`manageAvailability:rateSource.${pricePreview.source.replace(/ /g, '')}`, pricePreview.source)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 space-y-4 bg-muted/20 dark:bg-muted/10 w-full">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label htmlFor="customRate" className="text-xs font-medium text-muted-foreground">{t('manageAvailability:customRatePerHour')}</Label>
                              <Input
                                id="customRate"
                                type="number"
                                name="priceOverride.customRatePerHour.amount"
                                value={formData.priceOverride.customRatePerHour.amount}
                                onChange={handleInputChange}
                                placeholder="99.00"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="currency" className="text-xs font-medium text-muted-foreground">{t('common:currency')}</Label>
                              <Input
                                id="currency"
                                value={formData.priceOverride.customRatePerHour.currency}
                                readOnly
                                disabled
                                className="cursor-not-allowed"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border bg-background p-3">
                            <Label htmlFor="allowDiscounts" className="flex items-center gap-3 font-medium cursor-pointer">
                              {t('manageAvailability:allowDiscounts')}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info size={14} className="text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">{t('manageAvailability:allowDiscountsTooltip')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </Label>
                            <Switch
                              id="allowDiscounts"
                              checked={formData.priceOverride.allowDiscounts}
                              onCheckedChange={handleAllowDiscountsChange}
                            />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 dark:bg-muted/10 p-3">
              <Label htmlFor="availableForInstantBooking" className="flex items-center gap-2 font-medium cursor-pointer">
                <Clock size={16} className="text-muted-foreground" />
                {t('manageAvailability:availableForInstantBooking')}
              </Label>
              <Switch
                id="availableForInstantBooking"
                checked={formData.availableForInstantBooking}
                onCheckedChange={(checked) => handleInputChange({ target: { name: 'availableForInstantBooking', type: 'checkbox', checked } })}
              />
            </div>

               <div className="rounded-lg border bg-muted/20 dark:bg-muted/10">
            <div 
              className={`relative flex items-center justify-between p-3 ${formData.overtime.allowOvertime ? 'cursor-pointer pb-5' : ''}`}
              onClick={() => formData.overtime.allowOvertime && setIsOvertimeExpanded(!isOvertimeExpanded)}
            >
              <Label htmlFor="overtime.allowOvertime" className="flex items-center gap-2 font-medium cursor-pointer">
                <Clock2 size={16} className="text-muted-foreground" />
                {t('manageAvailability:allowOvertime')}
              </Label>
              <Switch
                id="overtime.allowOvertime"
                name="overtime.allowOvertime"
                checked={formData.overtime.allowOvertime}
                onCheckedChange={(checked) => {
                  handleInputChange({ target: { name: 'overtime.allowOvertime', type: 'checkbox', checked } });
                  if (!checked) setIsOvertimeExpanded(false);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              {formData.overtime.allowOvertime && (
                <ChevronDown 
                  size={20} 
                  className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-muted-foreground transition-transform duration-200 ${isOvertimeExpanded ? 'rotate-180' : ''}`}
                />
              )}
            </div>

            <AnimatePresence>
              {isOvertimeExpanded && formData.overtime.allowOvertime && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-3 pt-3 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="overtime.freeOvertimeDuration" className="text-xs font-normal text-muted-foreground">
                          {t('manageAvailability:freeOvertimeDuration')} ({t('common:minutes')})
                        </Label>
                        <Input
                          type="number"
                          id="overtime.freeOvertimeDuration"
                          name="overtime.freeOvertimeDuration"
                          value={formData.overtime.freeOvertimeDuration}
                          variant="compact"
                          onChange={handleInputChange}
                          min="0"
                        />
                        {errors.freeOvertimeDuration && (
                          <p className="text-sm text-destructive">{errors.freeOvertimeDuration}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="overtime.paidOvertimeDuration" className="text-xs font-normal text-muted-foreground">
                          {t('manageAvailability:paidOvertimeDuration')} ({t('common:minutes')})
                        </Label>
                        <Input
                          type="number"
                          id="overtime.paidOvertimeDuration"
                          name="overtime.paidOvertimeDuration"
                          variant="compact"
                          value={formData.overtime.paidOvertimeDuration}
                          onChange={handleInputChange}
                          min="0"
                        />
                        {errors.paidOvertimeDuration && (
                          <p className="text-sm text-destructive">{errors.paidOvertimeDuration}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="overtime.overtimeRate" className="text-xs font-normal text-muted-foreground">
                          {t('manageAvailability:overtimeRate')}
                        </Label>
                        <Input
                          type="number"
                          id="overtime.overtimeRate"
                          name="overtime.overtimeRate"
                          variant="compact"
                          value={formData.overtime.overtimeRate}
                          onChange={handleInputChange}
                          min="0"
                          max="500"
                        />
                        {errors.overtimeRate && (
                          <p className="text-sm text-destructive">{errors.overtimeRate}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
            </form>
        </div>

         <DialogFooter className="flex-shrink-0 flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
            <Button type="button" variant="outline" onClick={onClose} className="w-full md:w-auto md:mr-auto">
              {t('common:cancel')}
            </Button>
            {isEditMode && (
              <Button type="button" variant="delete-outline" onClick={handleDelete} className="w-full md:w-auto">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common:delete')}
              </Button>
            )}
            <Button type="submit" form="availability-form" className="gap-0 w-full md:w-auto" disabled={isSubmitting}>
              {isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSubmitting ? t('common:saving') : t('common:save')}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WrappedManageAvailabilityModal = (props) => (
  <ErrorBoundary>
    <ManageAvailabilityModal {...props} />
  </ErrorBoundary>
);

WrappedManageAvailabilityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  availabilityData: PropTypes.object,
  coachId: PropTypes.string.isRequired,
};

export default WrappedManageAvailabilityModal;