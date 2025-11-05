import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { PlusCircle, Edit2, Trash2 } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import AddEditSessionModal from './AddEditSessionModal';
import AddEditAvailabilityModal from './AddEditAvailabilityModal';
import { toast } from 'react-hot-toast';
import { getCoachAvailability, updateCoachAvailability } from '../services/coachAPI';

const localizer = momentLocalizer(moment);

const CoachAvailabilityManager = ({ coachId, availability, settings, onAvailabilityChange, onSettingsChange }) => {
  const { t } = useTranslation(['common', 'managesessions']);
  const [slots, setSlots] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState([]);

  useEffect(() => {
    fetchAvailability();
  }, [coachId]);

  const fetchAvailability = async () => {
    try {
      setLoading(true);
      const data = await getCoachAvailability(coachId);
      setAvailability(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error(t('managesessions:errorFetchingAvailability'));
      setLoading(false);
    }
  };

  const handleAddSlot = () => {
    setSelectedSlot(null);
    setShowModal(true);
  };

  const handleEditSlot = (slot) => {
    setSelectedSlot(slot);
    setShowModal(true);
  };

  const handleDeleteSlot = async (slotToDelete) => {
    try {
      const updatedAvailability = availability.filter(slot => slot.id !== slotToDelete.id);
      await updateCoachAvailability(coachId, updatedAvailability);
      setAvailability(updatedAvailability);
      toast.success(t('managesessions:slotDeleted'));
    } catch (error) {
      console.error('Error deleting availability slot:', error);
      toast.error(t('managesessions:errorDeletingSlot'));
    }
  };

  const eventStyleGetter = (event) => {
    return {
      style: {
        backgroundColor: '#4299e1',
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
        padding: '4px',
        fontSize: '0.75rem',
        textAlign: 'center',
      }
    };
  };

  const handleSaveSlot = async (slotData) => {
    try {
      let updatedAvailability;
      if (selectedSlot) {
        updatedAvailability = availability.map(slot => 
          slot.id === selectedSlot.id ? { ...slot, ...slotData } : slot
        );
      } else {
        updatedAvailability = [...availability, { id: Date.now(), ...slotData }];
      }
      await updateCoachAvailability(coachId, updatedAvailability);
      setAvailability(updatedAvailability);
      setShowModal(false);
      toast.success(selectedSlot ? t('managesessions:slotUpdated') : t('managesessions:slotAdded'));
    } catch (error) {
      console.error('Error saving availability slot:', error);
      toast.error(t('managesessions:errorSavingSlot'));
    }
  };

  if (loading) {
    return <div>{t('common:loading')}</div>;
  }

  return (
    <div className="coach-availability-manager">
      <h2>{t('managesessions:manageYourAvailability')}</h2>
      <Calendar
        localizer={localizer}
        events={availability}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500 }}
        views={['month', 'week']}
        defaultView="week"
        selectable
        onSelectSlot={handleAddSlot}
        onSelectEvent={handleEditSlot}
        eventPropGetter={(event) => ({
          className: 'availability-slot',
          style: {
            backgroundColor: '#4299e1',
          },
        })}
      />
      <button onClick={handleAddSlot} className="btn-add">
        <PlusCircle size={16} /> {t('managesessions:addSlot')}
      </button>
      {showModal && (
        <AddEditAvailabilityModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveSlot}
          slotData={selectedSlot}
        />
      )}
    </div>
  );
};

CoachAvailabilityManager.propTypes = {
  coachId: PropTypes.string.isRequired,
};

export default CoachAvailabilityManager;