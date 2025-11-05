import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const AvailabilitySessionForm = ({ formData, handleInputChange, handleDateChange, errors }) => {
  const { t } = useTranslation(['common', 'managesessions']);

  return (
    <>
      <div className="form-group">
        <label htmlFor="repeat">{t('managesessions:repeat')}</label>
        <select
          id="repeat"
          name="repeat"
          value={formData.repeat || 'none'}
          onChange={handleInputChange}
          className="input-field"
        >
          <option value="none">{t('managesessions:none')}</option>
          <option value="daily">{t('managesessions:daily')}</option>
          <option value="weekly">{t('managesessions:weekly')}</option>
          <option value="monthly">{t('managesessions:monthly')}</option>
        </select>
      </div>
      {formData.repeat !== 'none' && (
        <div className="form-group">
          <label htmlFor="repeatUntil">{t('managesessions:repeatUntil')}</label>
          <DatePicker
            selected={formData.repeatUntil ? new Date(formData.repeatUntil) : null}
            onChange={(date) => handleDateChange(date, 'repeatUntil')}
            className="input-field"
          />
          {errors.repeatUntil && <span className="error">{errors.repeatUntil}</span>}
        </div>
      )}
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="availableForInstantBooking"
            checked={formData.availableForInstantBooking || false}
            onChange={handleInputChange}
          />
          {t('managesessions:availableForInstantBooking')}
        </label>
      </div>
      <div className="form-group">
        <label htmlFor="notes">{t('managesessions:notes')}</label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes || ''}
          onChange={handleInputChange}
          className="input-field"
          rows={3}
        />
      </div>
    </>
  );
};

AvailabilitySessionForm.propTypes = {
  formData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  handleDateChange: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
};

export default AvailabilitySessionForm;