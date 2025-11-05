import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { X, Calendar, Clock, RepeatIcon } from 'lucide-react';
import moment from 'moment';

const AddEditAvailabilityModal = ({ onClose, onSave, slotData }) => {
  const { t } = useTranslation(['common', 'managesessions']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    start: new Date(),
    end: new Date(new Date().setHours(new Date().getHours() + 1)),
    isRecurring: false,
    recurringPattern: 'weekly',
    recurringEndDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
  });

  useEffect(() => {
    if (slotData) {
      setFormData(slotData);
    }
  }, [slotData]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDateChange = (date, field) => {
    setFormData(prev => ({ ...prev, [field]: date }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return; // Prevent multiple submissions
    
    setIsSubmitting(true);
    
    try {
      const availabilityData = {
        ...formData,
        isAvailability: true,  // Explicitly set this flag
        sessionTypeId: '66ec551a4a8965b22af33fe3'  // Default availability session type
      };
      
      // Call the save function and wait for it to complete
      await onSave(availabilityData);
      
      // Close the modal only on successful submission
      onClose();
    } catch (error) {
      console.error('Error saving availability:', error);
      // You might want to show an error message to the user here
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateSelection = (date) => {
    const newDate = moment(date).startOf('day');
    setFormData(prev => ({
      ...prev,
      start: moment(prev.start).year(newDate.year()).month(newDate.month()).date(newDate.date()).toDate(),
      end: moment(prev.end).year(newDate.year()).month(newDate.month()).date(newDate.date()).toDate(),
    }));
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <button className="close-button" onClick={onClose} disabled={isSubmitting}>
          <X size={24} />
        </button>
        <h2>{slotData ? t('managesessions:editAvailability') : t('managesessions:addAvailability')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="selection-section">
            <div className="section-title">
              <Calendar size={18} />
              <span>{t('managesessions:selectDate')}</span>
            </div>
            <div className="date-options-scroll">
              <div className="date-options">
                {Array.from({ length: 30 }, (_, i) => moment().add(i, 'days').toDate()).map((date) => {
                  const dateStr = moment(date).format('YYYY-MM-DD');
                  const isSelected = moment(formData.start).isSame(date, 'day');
                  
                  return (
                     <button
                                         key={dateStr}
                                         type="button"
                                         className={`date-option ${isSelected ? 'selected' : ''}`}
                                         onClick={() => handleDateSelection(date)}
                                       >
                                         <span className="date-day">{t(`common:${moment(date).format('dddd').toLowerCase()}`).slice(0, 3)}</span>
                                         <span className="date-number">{moment(date).format('D')}</span>
                                         <span className="date-month">{t(`common:${moment(date).format('MMMM').toLowerCase()}`).slice(0, 1).toUpperCase() + t(`common:${moment(date).format('MMMM').toLowerCase()}`).slice(1, 3)}</span>
                                       </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="selection-section">
            <div className="section-title">
              <Clock size={18} />
              <span>{t('managesessions:selectTime')}</span>
            </div>
            <div className="time-selection">
              <div className="time-input-group">
                <label htmlFor="startTime">{t('managesessions:startTime')}</label>
                <input
                  type="time"
                  id="startTime"
                  value={moment(formData.start).format('HH:mm')}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':');
                    const newStart = moment(formData.start).hours(hours).minutes(minutes).toDate();
                    handleDateChange(newStart, 'start');
                  }}
                  className="time-input"
                />
              </div>
              <div className="time-input-group">
                <label htmlFor="endTime">{t('managesessions:endTime')}</label>
                <input
                  type="time"
                  id="endTime"
                  value={moment(formData.end).format('HH:mm')}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':');
                    const newEnd = moment(formData.end).hours(hours).minutes(minutes).toDate();
                    handleDateChange(newEnd, 'end');
                  }}
                  className="time-input"
                />
              </div>
            </div>
          </div>

          <div className="selection-section">
            <div className="section-title">
              <RepeatIcon size={18} />
              <span>{t('managesessions:recurringOptions')}</span>
            </div>
            <div className="recurring-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="isRecurring"
                  checked={formData.isRecurring}
                  onChange={handleInputChange}
                />
                {t('managesessions:recurring')}
              </label>
              {formData.isRecurring && (
                <>
                  <select
                    name="recurringPattern"
                    value={formData.recurringPattern}
                    onChange={handleInputChange}
                    className="recurring-select"
                  >
                    <option value="daily">{t('managesessions:daily')}</option>
                    <option value="weekly">{t('managesessions:weekly')}</option>
                    <option value="monthly">{t('managesessions:monthly')}</option>
                  </select>
                  <div className="recurring-end-date">
                    <label>{t('managesessions:recurringEndDate')}</label>
                    <input
                      type="date"
                      name="recurringEndDate"
                      value={moment(formData.recurringEndDate).format('YYYY-MM-DD')}
                      onChange={(e) => handleInputChange({
                        target: {
                          name: 'recurringEndDate',
                          value: moment(e.target.value).toDate()
                        }
                      })}
                      min={moment().add(1, 'day').format('YYYY-MM-DD')}
                      className="date-input"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? t('common:saving') 
                : (slotData ? t('common:update') : t('common:add'))}
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary"
              disabled={isSubmitting}
            >
              {t('common:cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

AddEditAvailabilityModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  slotData: PropTypes.object,
};

export default AddEditAvailabilityModal;