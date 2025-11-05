import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
// DatePicker is no longer needed here for early bird if handled in main modal

const GroupSessionForm = ({ formData, handleInputChange, errors }) => {
  const { t } = useTranslation(['common', 'managesessions']);

  return (
    <>
      <div className="add-edit-session-form-group">
        <label htmlFor="minAttendees" className="add-edit-session-label">{t('managesessions:minAttendees')}</label>
        <input
          type="number"
          id="minAttendees"
          name="minAttendees"
          value={formData.minAttendees || ''}
          onChange={handleInputChange}
          min="1"
          className="add-edit-session-input"
        />
        {errors.minAttendees && <span className="add-edit-session-error-text">{errors.minAttendees}</span>}
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="maxAttendees" className="add-edit-session-label">{t('managesessions:maxAttendees')}</label>
        <input
          type="number"
          id="maxAttendees"
          name="maxAttendees"
          value={formData.maxAttendees || ''}
          onChange={handleInputChange}
          min={formData.minAttendees || '1'}
          className="add-edit-session-input"
        />
        {errors.maxAttendees && <span className="add-edit-session-error-text">{errors.maxAttendees}</span>}
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="sessionTopic" className="add-edit-session-label">{t('managesessions:sessionTopic')}</label>
        <input
          type="text"
          id="sessionTopic"
          name="sessionTopic"
          value={formData.sessionTopic || ''}
          onChange={handleInputChange}
          className="add-edit-session-input"
        />
        {errors.sessionTopic && <span className="add-edit-session-error-text">{errors.sessionTopic}</span>}
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="prerequisites" className="add-edit-session-label">{t('managesessions:prerequisites')}</label>
        <textarea
          id="prerequisites"
          name="prerequisites"
          value={formData.prerequisites || ''}
          onChange={handleInputChange}
          className="add-edit-session-input add-edit-session-textarea"
          rows={3}
        />
         {errors.prerequisites && <span className="add-edit-session-error-text">{errors.prerequisites}</span>}
      </div>
    </>
  );
};

GroupSessionForm.propTypes = {
  formData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  // handleDateChange is removed as Early Bird DatePicker is removed
  errors: PropTypes.object.isRequired,
};

export default GroupSessionForm;