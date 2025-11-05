import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
// DatePicker is no longer needed here

const WorkshopSessionForm = ({ formData, handleInputChange, errors }) => {
  const { t } = useTranslation(['common', 'managesessions']);

  return (
    <>
      <div className="add-edit-session-form-group">
        <label htmlFor="workshopTitle" className="add-edit-session-label">{t('managesessions:workshopTitle')}</label>
        <input
          type="text"
          id="workshopTitle"
          name="workshopTitle"
          value={formData.workshopTitle || ''}
          onChange={handleInputChange}
          className="add-edit-session-input"
        />
        {errors.workshopTitle && <span className="add-edit-session-error-text">{errors.workshopTitle}</span>}
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="learningObjectives" className="add-edit-session-label">{t('managesessions:learningObjectives')}</label>
        <textarea
          id="learningObjectives"
          name="learningObjectives"
          value={formData.learningObjectives || ''}
          onChange={handleInputChange}
          className="add-edit-session-input add-edit-session-textarea"
          rows={3}
        />
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="materialsProvided" className="add-edit-session-label">{t('managesessions:materialsProvided')}</label>
        <textarea
          id="materialsProvided"
          name="materialsProvided"
          value={formData.materialsProvided || ''}
          onChange={handleInputChange}
          className="add-edit-session-input add-edit-session-textarea"
          rows={3}
        />
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="whatToBring" className="add-edit-session-label">{t('managesessions:whatToBring')}</label>
        <textarea
          id="whatToBring"
          name="whatToBring"
          value={formData.whatToBring || ''}
          onChange={handleInputChange}
          className="add-edit-session-input add-edit-session-textarea"
          rows={3}
        />
      </div>
      <div className="add-edit-session-form-group">
        <label htmlFor="skillLevel" className="add-edit-session-label">{t('managesessions:skillLevel')}</label>
        <select
          id="skillLevel"
          name="skillLevel"
          value={formData.skillLevel || 'allLevels'}
          onChange={handleInputChange}
          className="add-edit-session-input" // Use shared class
        >
          <option value="beginner">{t('managesessions:beginner')}</option>
          <option value="intermediate">{t('managesessions:intermediate')}</option>
          <option value="advanced">{t('managesessions:advanced')}</option>
          <option value="allLevels">{t('managesessions:allLevels')}</option>
        </select>
      </div>
    </>
  );
};

WorkshopSessionForm.propTypes = {
  formData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  // handleDateChange removed
  errors: PropTypes.object.isRequired,
};

export default WorkshopSessionForm;