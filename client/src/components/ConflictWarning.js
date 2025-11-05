import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import { AlertTriangle, X, Check, Calendar, Trash2 } from 'lucide-react';

const ConflictWarning = ({ conflicts, newBooking, onResolve, onClose }) => {
  const renderId = useRef(Date.now()).current;
  console.log('[ConflictWarning] Rendering with props:', { conflicts, newBooking });

  const { t } = useTranslation(['common', 'managesessions']);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    console.log('[ConflictWarning] useEffect running');
    const bookings = [newBooking, ...(Array.isArray(conflicts) ? conflicts : [])].filter(Boolean);
    console.log('[ConflictWarning] Setting allBookings:', bookings);
    setAllBookings(bookings);

    if (bookings.length === 1) {
      console.log('[ConflictWarning] Auto-selecting single booking');
      setSelectedBooking(bookings[0]);
    }

    if (modalRef.current) {
      console.log('[ConflictWarning] Focusing on modal');
      modalRef.current.focus();
    }
  }, [conflicts, newBooking, renderId]);

  const handleBookingSelect = useCallback((booking) => {
    console.log('[ConflictWarning] Booking selected:', booking);
    setSelectedBooking(booking);
  }, []);

  const handleConfirm = useCallback(() => {
    console.log('[ConflictWarning] Confirm clicked, selectedBooking:', selectedBooking);
    if (selectedBooking) {
      setShowConfirmation(true);
    }
  }, [selectedBooking]);

  const handleFinalConfirm = useCallback(() => {
    console.log('[ConflictWarning] Final confirmation, keeping:', selectedBooking);
    const bookingsToRemove = allBookings.filter(b => b !== selectedBooking);
    console.log('[ConflictWarning] Bookings to remove:', bookingsToRemove);
    onResolve(selectedBooking, bookingsToRemove);
  }, [selectedBooking, allBookings, onResolve]);

  const handleCloseModal = useCallback((e) => {
    console.log('[ConflictWarning] Closing modal');
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }, [onClose]);

  const handleModalClick = useCallback((e) => {
    console.log('[ConflictWarning] Modal clicked');
    e.stopPropagation();
  }, []);

  const getSessionTypeName = useCallback((booking) => {
    if (booking.sessionType?.name) return booking.sessionType.name;
    if (booking.type) return booking.type;
    return 'Unknown session type';
  }, []);

  const formatBookingTime = useCallback((booking) => {
    if (!booking.start || !booking.end) return 'Invalid time';
    return `${moment(booking.start).format('MMMM D, YYYY h:mm A')} - ${moment(booking.end).format('h:mm A')}`;
  }, []);

  console.log(`[ConflictWarning ${renderId}] Rendering component, showConfirmation:`, showConfirmation);

  return (
    <div className="conflict-modal" onClick={handleCloseModal}>
  <div 
    className="conflict-modal-content" 
    onClick={(e) => e.stopPropagation()}
    ref={modalRef}
    tabIndex="-1"
  >
        <div className="conflict-header">
          <h3 className="conflict-title">
            <AlertTriangle size={24} />
            {t('managesessions:conflictDetected')}
          </h3>
          <button 
            onClick={(e) => {
              console.log('[ConflictWarning] Close button clicked');
              handleCloseModal(e);
            }} 
            className="conflict-close" 
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        <p className="conflict-instruction">
          {allBookings.length > 1
            ? t('managesessions:chooseBookingToKeep')
            : t('managesessions:confirmNewBooking')}
        </p>

        <ul className="conflict-list">
          {allBookings.map((booking, index) => (
            <li 
              key={booking._id || `new-booking-${index}`}
              className={`conflict-item ${selectedBooking === booking ? 'selected' : ''}`}
              onClick={() => {
                console.log('[ConflictWarning] Booking item clicked:', booking);
                handleBookingSelect(booking);
              }}
            >
              <div className="conflict-item-content">
                <span className="conflict-session-title">
                  {booking.title || t(`managesessions:${getSessionTypeName(booking)}`)}
                </span>
                <span className="conflict-session-time">
                  <Calendar size={14} className="conflict-icon" />
                  {formatBookingTime(booking)}
                </span>
                {booking === newBooking && (
                  <span className="conflict-new-badge">{t('managesessions:new')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!showConfirmation ? (
          <div className="conflict-actions">
            <button 
              onClick={() => {
                console.log('[ConflictWarning] Keep selected button clicked');
                handleConfirm();
              }} 
              className="conflict-btn conflict-btn-primary" 
              disabled={!selectedBooking}
            >
              <Check size={16} />
              {allBookings.length > 1 ? t('managesessions:keepSelected') : t('common:confirm')}
            </button>
            <button 
              onClick={(e) => {
                console.log('[ConflictWarning] Cancel button clicked');
                handleCloseModal(e);
              }} 
              className="conflict-btn conflict-btn-secondary"
            >
              {t('common:cancel')}
            </button>
          </div>
        ) : (
          <div className="conflict-confirmation">
            <p>{t('managesessions:confirmCancellation', { count: allBookings.length - 1 })}</p>
            <div className="conflict-actions">
              <button 
                onClick={() => {
                  console.log('[ConflictWarning] Confirm and cancel button clicked');
                  handleFinalConfirm();
                }} 
                className="conflict-btn conflict-btn-danger"
              >
                <Trash2 size={16} />
                {t('managesessions:confirmAndCancel')}
              </button>
              <button 
                onClick={() => {
                  console.log('[ConflictWarning] Go back button clicked');
                  setShowConfirmation(false);
                }} 
                className="conflict-btn conflict-btn-secondary"
              >
                {t('common:goBack')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

ConflictWarning.propTypes = {
  conflicts: PropTypes.oneOfType([
    PropTypes.array,
    PropTypes.object
  ]),
  newBooking: PropTypes.object.isRequired,
  onResolve: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ConflictWarning;