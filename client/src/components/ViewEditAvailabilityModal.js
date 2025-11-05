import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Trash2, Loader2, AlertCircle, MapPin, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import moment from 'moment-timezone';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Switch } from './ui/switch.tsx';
import { Input } from './ui/input.tsx';
import { formatDate, formatTime, calculateDuration } from '../utils/dateUtils.js';
import { logger } from '../utils/logger.js';
import ErrorBoundary from './ErrorBoundary.js';
import LoadingSpinner from './LoadingSpinner.js';

const ViewEditAvailabilityModal = ({ isOpen, onClose, onSave, onDelete, slotData }) => {
  const { t } = useTranslation(['managesessions', 'common', 'bookings']);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [editableStart, setEditableStart] = useState(null);
  const [editableEnd, setEditableEnd] = useState(null);
  const [initialSlotData, setInitialSlotData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOvertimeExpanded, setIsOvertimeExpanded] = useState(false);
  const [isEditingOvertime, setIsEditingOvertime] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({
    allowOvertime: false,
    freeOvertimeDuration: 0,
    paidOvertimeDuration: 0,
    overtimeRate: 0,
  });
  const [overtimeErrors, setOvertimeErrors] = useState({});

  const timezone = useMemo(() => slotData?.timezone || moment.tz.guess(), [slotData]);

  useEffect(() => {
    console.info('[ViewEditAvailabilityModal] useEffect triggered with slotData:', slotData);
    if (slotData) {
      try {
        const start = new Date(slotData.start);
        const end = new Date(slotData.end);
        console.info('[ViewEditAvailabilityModal] Parsed start and end:', { start, end });
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error('[ViewEditAvailabilityModal] Invalid start or end date:', { start: slotData.start, end: slotData.end });
          setError(t('managesessions:errors.invalidDateFormat'));
          return;
        }
        setEditableStart(start);
        setEditableEnd(end);
        setInitialSlotData({ start, end });
        const overtime = slotData.overtime || {
          allowOvertime: false,
          freeOvertimeDuration: 0,
          paidOvertimeDuration: 0,
          overtimeRate: 0,
        };
        setOvertimeForm({
          allowOvertime: overtime.allowOvertime ?? false,
          freeOvertimeDuration: overtime.freeOvertimeDuration ?? 0,
          paidOvertimeDuration: overtime.paidOvertimeDuration ?? 0,
          overtimeRate: overtime.overtimeRate ?? 0,
        });
        setError(null);
        setIsSaving(false);
        setIsDeleting(false);
      } catch (err) {
        console.error('[ViewEditAvailabilityModal] Error parsing slotData dates:', err, { slotData });
        setError(t('managesessions:errors.invalidDateFormat'));
      }
    } else {
      console.warn('[ViewEditAvailabilityModal] slotData is null or undefined');
      setEditableStart(null);
      setEditableEnd(null);
      setInitialSlotData(null);
      setError(null);
    }
  }, [slotData, t]);

  const isModified = useMemo(() => {
    if (!initialSlotData || !editableStart || !editableEnd) return false;
    const timeModified = initialSlotData.start.getTime() !== editableStart.getTime() || initialSlotData.end.getTime() !== editableEnd.getTime();
    const overtimeModified =
      slotData.overtime?.allowOvertime !== overtimeForm.allowOvertime ||
      slotData.overtime?.freeOvertimeDuration !== overtimeForm.freeOvertimeDuration ||
      slotData.overtime?.paidOvertimeDuration !== overtimeForm.paidOvertimeDuration ||
      slotData.overtime?.overtimeRate !== overtimeForm.overtimeRate;
    return timeModified || overtimeModified;
  }, [initialSlotData, editableStart, editableEnd, overtimeForm, slotData]);

  const isValid = useMemo(() => {
    return editableStart && editableEnd && editableEnd > editableStart;
  }, [editableStart, editableEnd]);

  const handleDateChange = useCallback((e) => {
    const newDateStr = e.target.value;
    if (!newDateStr || !editableStart || !editableEnd) return;
    try {
      const newDate = moment.tz(newDateStr, timezone).startOf('day');
      if (!newDate.isValid()) {
        setError(t('managesessions:errors.invalidDateFormat'));
        return;
      }
      const updatedStart = moment(editableStart).tz(timezone).set({
        year: newDate.year(),
        month: newDate.month(),
        date: newDate.date()
      }).toDate();
      const updatedEnd = moment(editableEnd).tz(timezone).set({
        year: newDate.year(),
        month: newDate.month(),
        date: newDate.date()
      }).toDate();
      setEditableStart(updatedStart);
      setEditableEnd(updatedEnd);
      setError(updatedEnd <= updatedStart ? t('managesessions:errors.endTimeBeforeStart') : null);
    } catch (err) {
      setError(t('managesessions:errors.invalidDateFormat'));
    }
  }, [editableStart, editableEnd, timezone, t]);

  const handleTimeChange = useCallback((e, field) => {
    const timeStr = e.target.value;
    if (!timeStr || !editableStart || !editableEnd) return;
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        setError(t('managesessions:errors.invalidTimeFormat'));
        return;
      }
      const currentMoment = field === 'start' ? moment(editableStart).tz(timezone) : moment(editableEnd).tz(timezone);
      const newDate = currentMoment.hours(hours).minutes(minutes).toDate();
      if (field === 'start') {
        setEditableStart(newDate);
        setError(editableEnd <= newDate ? t('managesessions:errors.endTimeBeforeStart') : null);
      } else {
        setEditableEnd(newDate);
        setError(newDate <= editableStart ? t('managesessions:errors.endTimeBeforeStart') : null);
      }
    } catch (err) {
      setError(t('managesessions:errors.invalidTimeFormat'));
    }
  }, [editableStart, editableEnd, timezone, t]);

  const validateOvertimeForm = () => {
    const errors = {};
    const freeOvertime = overtimeForm.freeOvertimeDuration === '' ? 0 : Number(overtimeForm.freeOvertimeDuration);
    const paidOvertime = overtimeForm.paidOvertimeDuration === '' ? 0 : Number(overtimeForm.paidOvertimeDuration);
    const overtimeRate = overtimeForm.overtimeRate === '' ? 0 : Number(overtimeForm.overtimeRate);

    if (freeOvertime < 0) {
      errors.freeOvertimeDuration = t('bookings:errors.freeOvertimeNonNegative');
    }
    if (paidOvertime < 0) {
      errors.paidOvertimeDuration = t('bookings:errors.paidOvertimeNonNegative');
    }
    if (overtimeRate < 0) {
      errors.overtimeRate = t('bookings:errors.overtimeRateNonNegative');
    }

    setOvertimeErrors(errors);
    logger.info('[ViewEditAvailabilityModal] Overtime form validation result', { errors });
    return Object.keys(errors).length === 0;
  };

  const handleOvertimeInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    logger.info('[ViewEditAvailabilityModal] Handling overtime input change', { name, value, type, checked });
    setOvertimeForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value === '' ? '' : Number(value) || 0,
    }));
  };

  const handleSave = async () => {
    if (!isValid || isSaving || isDeleting || !isModified) return;
    if (!validateOvertimeForm()) {
      setError(t('bookings:errors.overtimeValidationFailed'));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        _id: slotData._id,
        start: editableStart.toISOString(),
        end: editableEnd.toISOString(),
        isAvailability: true,
        sessionType: slotData.sessionType?._id || slotData.sessionType,
        timezone,
        overtime: {
          allowOvertime: overtimeForm.allowOvertime,
          freeOvertimeDuration: Number(overtimeForm.freeOvertimeDuration) || 0,
          paidOvertimeDuration: Number(overtimeForm.paidOvertimeDuration) || 0,
          overtimeRate: Number(overtimeForm.overtimeRate) || 0,
        },
      };
      logger.info('[ViewEditAvailabilityModal] Saving availability with payload:', payload);
      await onSave(payload);
      setOvertimeForm({
        allowOvertime: payload.overtime.allowOvertime,
        freeOvertimeDuration: payload.overtime.freeOvertimeDuration,
        paidOvertimeDuration: payload.overtime.paidOvertimeDuration,
        overtimeRate: payload.overtime.overtimeRate,
      });
      setIsEditingOvertime(false);
      setIsOvertimeExpanded(false);
      onClose();
    } catch (err) {
      logger.error('[ViewEditAvailabilityModal] Error saving availability:', err);
      setError(err.response?.data?.message || err.message || t('common:errors.unknownError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isSaving || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(slotData._id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('common:errors.unknownError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const renderSessionDetails = () => {
    if (!slotData || !initialSlotData) return null;
    return (
      <div className="booking-details__section">
        <div className="booking-details__session-info">
          <div className="booking-details__info-item">
            <Calendar className="booking-details__info-icon" />
            <div className="booking-details__info-content">
              <span className="booking-details__info-label">{t('bookings:date')}</span>
              <span className="booking-details__info-value">{formatDate(initialSlotData.start)}</span>
            </div>
          </div>
          <div className="booking-details__info-item">
            <Clock className="booking-details__info-icon" />
            <div className="booking-details__info-content">
              <span className="booking-details__info-label">{t('bookings:time')}</span>
              <span className="booking-details__info-value">{formatTime(initialSlotData.start)} - {formatTime(initialSlotData.end)}</span>
            </div>
          </div>
          <div className="booking-details__info-item">
            <Users className="booking-details__info-icon" />
            <div className="booking-details__info-content">
              <span className="booking-details__info-label">{t('bookings:duration')}</span>
              <span className="booking-details__info-value">{calculateDuration(initialSlotData.start, initialSlotData.end)} {t('bookings:minutes')}</span>
            </div>
          </div>
          <div className="booking-details__info-item">
            <MapPin className="booking-details__info-icon" />
            <div className="booking-details__info-content">
              <span className="booking-details__info-label">{t('bookings:timezone')}</span>
              <span className="booking-details__info-value">{timezone}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEditableDetails = () => {
    if (!isEditing || !slotData) return null;
    const formattedDate = moment(editableStart).tz(timezone).format('YYYY-MM-DD');
    const formattedStartTime = moment(editableStart).tz(timezone).format('HH:mm');
    const formattedEndTime = moment(editableEnd).tz(timezone).format('HH:mm');
  
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="booking-details__section mt-2"
      >
        <div className="booking-details__session-info">
          <div className="flex items-start gap-3" style={{ display: 'flex !important', flexDirection: 'row !important', justifyContent: 'space-between !important', width: '100% !important' }}>
            <div className="booking-details__info-item flex items-start">
              <Calendar className="booking-details__info-icon mt-1" />
              <div className="booking-details__info-content">
                <label htmlFor="availability-date" className="booking-details__info-label">{t('bookings:date')}</label>
                <input
                  id="availability-date"
                  type="date"
                  value={formattedDate}
                  onChange={handleDateChange}
                  className="booking-details__info-value mt-1 p-1 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary"
                  style={{ width: '130px !important' }}
                  disabled={isSaving || isDeleting}
                />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="booking-details__info-item flex items-start">
                <Clock className="booking-details__info-icon mt-1" />
                <div className="booking-details__info-content">
                  <label htmlFor="availability-start-time" className="booking-details__info-label">{t('bookings:time')}</label>
                  <input
                    id="availability-start-time"
                    type="time"
                    value={formattedStartTime}
                    onChange={(e) => handleTimeChange(e, 'start')}
                    className="booking-details__info-value mt-1 p-1 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary"
                    style={{ width: '90px !important' }}
                    disabled={isSaving || isDeleting}
                    step="900"
                  />
                </div>
              </div>
              <div className="booking-details__info-item flex items-start">
                <Clock className="booking-details__info-icon mt-1 invisible" />
                <div className="booking-details__info-content">
                  <label htmlFor="availability-end-time" className="booking-details__info-label">{t('managesessions:endTime')}</label>
                  <input
                    id="availability-end-time"
                    type="time"
                    value={formattedEndTime}
                    onChange={(e) => handleTimeChange(e, 'end')}
                    className="booking-details__info-value mt-1 p-1 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary"
                    style={{ width: '90px !important' }}
                    disabled={isSaving || isDeleting}
                    step="900"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderOvertimeSettings = () => {
    if (!isEditing) return null;
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="booking-details__overtime-section mt-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{t('bookings:overtimeSettings')}</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOvertimeExpanded(!isOvertimeExpanded)}
            className="text-gray-600 hover:text-gray-800"
          >
            {isOvertimeExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span className="sr-only">{isOvertimeExpanded ? 'Collapse' : 'Expand'} overtime settings</span>
          </Button>
        </div>
        {isOvertimeExpanded && (
          <div className="mt-2">
            {isEditingOvertime ? (
              <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                <div className="flex items-center space-x-2">
                  <label htmlFor="allowOvertime" className="text-sm text-gray-600">
                    {t('bookings:allowOvertime')}
                  </label>
                  <Switch
                    id="allowOvertime"
                    name="allowOvertime"
                    checked={overtimeForm.allowOvertime}
                    onCheckedChange={(checked) =>
                      handleOvertimeInputChange({
                        target: { name: 'allowOvertime', type: 'checkbox', checked },
                      })
                    }
                    className={`
                      data-[state=unchecked]:bg-gray-200 
                      data-[state=checked]:bg-indigo-300 
                      focus-visible:ring-2 
                      focus-visible:ring-indigo-500 
                      focus-visible:ring-offset-2 
                      focus-visible:ring-offset-white
                    `}
                  />
                </div>
                {overtimeForm.allowOvertime && (
                  <>
                    <div className="flex flex-col space-y-1">
                      <label htmlFor="freeOvertimeDuration" className="text-sm text-gray-600">
                        {t('bookings:freeOvertimeDuration')} ({t('common:minutes')})
                      </label>
                      <Input
                        type="number"
                        id="freeOvertimeDuration"
                        name="freeOvertimeDuration"
                        value={overtimeForm.freeOvertimeDuration}
                        onChange={handleOvertimeInputChange}
                        min="0"
                        className="w-32"
                      />
                      {overtimeErrors.freeOvertimeDuration && (
                        <span className="text-red-600 text-xs">{overtimeErrors.freeOvertimeDuration}</span>
                      )}
                    </div>
                    <div className="flex flex-col space-y-1">
                      <label htmlFor="paidOvertimeDuration" className="text-sm text-gray-600">
                        {t('bookings:paidOvertimeDuration')} ({t('common:minutes')})
                      </label>
                      <Input
                        type="number"
                        id="paidOvertimeDuration"
                        name="paidOvertimeDuration"
                        value={overtimeForm.paidOvertimeDuration}
                        onChange={handleOvertimeInputChange}
                        min="0"
                        className="w-32"
                      />
                      {overtimeErrors.paidOvertimeDuration && (
                        <span className="text-red-600 text-xs">{overtimeErrors.paidOvertimeDuration}</span>
                      )}
                    </div>
                    <div className="flex flex-col space-y-1">
                      <label htmlFor="overtimeRate" className="text-sm text-gray-600">
                        {t('bookings:overtimeRate')} (%)
                      </label>
                   <Input
                        type="number"
                        id="overtimeRate"
                        name="overtimeRate"
                        value={overtimeForm.overtimeRate}
                        onChange={handleOvertimeInputChange}
                        min="0"
                        max="500"
                        className="w-32"
                      />
                      {overtimeErrors.overtimeRate && (
                        <span className="text-red-600 text-xs">{overtimeErrors.overtimeRate}</span>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button type="submit" size="sm">
                        {t('common:save')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingOvertime(false)}
                      >
                        {t('common:cancel')}
                      </Button>
                    </div>
                  </>
                )}
              </form>
            ) : (
              <div className="text-sm text-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <p>
                    {t('bookings:overtimeAllowed')}: {overtimeForm.allowOvertime ? t('common:yes') : t('common:no')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingOvertime(true)}
                  >
                    {t('common:edit')}
                  </Button>
                </div>
                {overtimeForm.allowOvertime && (
                  <>
                    <p>
                      {t('bookings:freeOvertime')}: {overtimeForm.freeOvertimeDuration} {t('common:minutes')}
                    </p>
                    <p>
                      {t('bookings:paidOvertime')}: {overtimeForm.paidOvertimeDuration} {t('common:minutes')}
                    </p>
                    <p>
                      {t('bookings:overtimeRate')}: {overtimeForm.overtimeRate}%
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  if (!slotData || !initialSlotData) {
    return (
      <ErrorBoundary>
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="booking-details-modal sm:max-w-lg max-w-[95vw] p-4">
            <div className="flex items-center justify-center p-8">
              <LoadingSpinner />
            </div>
          </DialogContent>
        </Dialog>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="booking-details-modal sm:max-w-lg max-w-[95vw] p-4">
          <DialogHeader className="booking-details__header border-b border-gray-200 pb-4">
            <DialogTitle className="booking-details__title">
              {t('managesessions:editAvailabilitySlot')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('managesessions:modalDescription', { defaultValue: 'A dialog for editing availability slots.' })}
            </DialogDescription>
            {initialSlotData && (
              <p className="booking-details__subtitle">
                {t('managesessions:originalTime')}: {formatDate(initialSlotData.start)} | {formatTime(initialSlotData.start)} - {formatTime(initialSlotData.end)}
              </p>
            )}
          </DialogHeader>
          <div className="booking-details__content space-y-6">
            {renderSessionDetails()}
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant="outline"
              className="booking-details__expand-button w-full mt-2"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isEditing ? t('common:cancelEdit') : t('managesessions:edit')}
            </Button>
            <AnimatePresence>
              {renderEditableDetails()}
              {renderOvertimeSettings()}
            </AnimatePresence>
            {error && (
              <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700 flex items-center border border-red-200">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {!isValid && editableStart && editableEnd && !error && (
              <div className="mt-4 p-3 bg-yellow-50 rounded text-sm text-yellow-700 flex items-center border border-yellow-200">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{t('managesessions:errors.endTimeMustBeAfterStart')}</span>
              </div>
            )}
            <div className="booking-details__actions mt-6">
              <Button
                variant="outline"
                className="booking-details__action-button booking-details__action-button--secondary"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                {t('common:cancel')}
              </Button>
              <Button
                className="booking-details__action-button booking-details__action-button--danger"
                onClick={handleDelete}
                disabled={isSaving || isDeleting}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                {isDeleting ? t('common:deleting') : t('common:delete')}
              </Button>
              <Button
                className="booking-details__action-button booking-details__action-button--primary"
                onClick={handleSave}
                disabled={!isValid || isSaving || isDeleting || !isModified}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {isSaving ? t('common:saving') : t('common:saveChanges')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
};

ViewEditAvailabilityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  slotData: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
    isAvailability: PropTypes.bool,
    sessionType: PropTypes.oneOfType([PropTypes.string, PropTypes.shape({ _id: PropTypes.string })]),
    timezone: PropTypes.string,
    overtime: PropTypes.shape({
      allowOvertime: PropTypes.bool,
      freeOvertimeDuration: PropTypes.number,
      paidOvertimeDuration: PropTypes.number,
      overtimeRate: PropTypes.number,
    }),
  }),
};

ViewEditAvailabilityModal.defaultProps = {
  slotData: null,
};

export default ViewEditAvailabilityModal;