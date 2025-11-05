import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PlusCircle, Edit2, Trash2, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const SessionTypes = ({ sessionTypes, onChange }) => {
  const { t } = useTranslation(['common', 'coachSettings']);
  const [newSessionType, setNewSessionType] = useState({
    name: '',
    duration: 60,
    price: 0,
  });
  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState({});

  const handleInputChange = (e, isEditing = false) => {
    const { name, value } = e.target;
    if (isEditing) {
      setEditingType((prev) => ({
        ...prev,
        [name]: name === 'duration' || name === 'price' ? Number(value) : value,
      }));
    } else {
      setNewSessionType((prev) => ({
        ...prev,
        [name]: name === 'duration' || name === 'price' ? Number(value) : value,
      }));
    }
  };

  const validateSessionType = (type) => {
    if (!type.name.trim()) {
      throw new Error(t('coachSettings:sessionTypeNameRequired'));
    }
    if (type.duration <= 0) {
      throw new Error(t('coachSettings:invalidDuration'));
    }
    if (type.price < 0) {
      throw new Error(t('coachSettings:invalidPrice'));
    }
  };

  const handleAddSessionType = () => {
    try {
      validateSessionType(newSessionType);
      const isDuplicate = sessionTypes.some(
        (type) => type.name.toLowerCase() === newSessionType.name.toLowerCase()
      );
      if (isDuplicate) {
        throw new Error(t('coachSettings:duplicateSessionType'));
      }
      const updatedSessionTypes = [
        ...sessionTypes,
        { ...newSessionType, id: Date.now() },
      ];
      onChange(updatedSessionTypes);
      setNewSessionType({ name: '', duration: 60, price: 0 });
      toast.success(t('coachSettings:sessionTypeAdded'));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleEditSessionType = (id) => {
    const typeToEdit = sessionTypes.find((type) => type.id === id);
    setEditingId(id);
    setEditingType({ ...typeToEdit });
  };

  const handleSaveEdit = () => {
    try {
      validateSessionType(editingType);
      const isDuplicate = sessionTypes.some(
        (type) =>
          type.id !== editingId &&
          type.name.toLowerCase() === editingType.name.toLowerCase()
      );
      if (isDuplicate) {
        throw new Error(t('coachSettings:duplicateSessionType'));
      }
      const updatedSessionTypes = sessionTypes.map((type) =>
        type.id === editingId ? { ...editingType } : type
      );
      onChange(updatedSessionTypes);
      setEditingId(null);
      setEditingType({});
      toast.success(t('coachSettings:sessionTypeUpdated'));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingType({});
  };

  const handleDeleteSessionType = (id) => {
    const updatedSessionTypes = sessionTypes.filter((type) => type.id !== id);
    onChange(updatedSessionTypes);
    toast.success(t('coachSettings:sessionTypeDeleted'));
  };

  return (
    <div className="session-types">
      <ul>
        {sessionTypes.map((type) => (
          <li key={type.id}>
            {editingId === type.id ? (
              <>
                <input
                  type="text"
                  name="name"
                  value={editingType.name}
                  onChange={(e) => handleInputChange(e, true)}
                  placeholder={t('coachSettings:sessionTypeName')}
                />
                <input
                  type="number"
                  name="duration"
                  value={editingType.duration}
                  onChange={(e) => handleInputChange(e, true)}
                  placeholder={t('coachSettings:sessionTypeDuration')}
                />
                <input
                  type="number"
                  name="price"
                  value={editingType.price}
                  onChange={(e) => handleInputChange(e, true)}
                  placeholder={t('coachSettings:sessionTypePrice')}
                />
                <button onClick={handleSaveEdit}>
                  <Check size={16} />
                </button>
                <button onClick={handleCancelEdit}>
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {type.name} - {type.duration} min - ${type.price}
                <button onClick={() => handleEditSessionType(type.id)}>
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDeleteSessionType(type.id)}>
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="add-session-type-form">
        <input
          type="text"
          name="name"
          value={newSessionType.name}
          onChange={handleInputChange}
          placeholder={t('coachSettings:sessionTypeName')}
        />
        <input
          type="number"
          name="duration"
          value={newSessionType.duration}
          onChange={handleInputChange}
          placeholder={t('coachSettings:sessionTypeDuration')}
        />
        <input
          type="number"
          name="price"
          value={newSessionType.price}
          onChange={handleInputChange}
          placeholder={t('coachSettings:sessionTypePrice')}
        />
        <button onClick={handleAddSessionType}>
          <PlusCircle size={16} /> {t('coachSettings:addSessionType')}
        </button>
      </div>
    </div>
  );
};

SessionTypes.propTypes = {
  sessionTypes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      duration: PropTypes.number.isRequired,
      price: PropTypes.number.isRequired,
    })
  ).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default SessionTypes;