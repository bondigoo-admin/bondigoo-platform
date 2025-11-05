import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { X, Calendar, Clock, User, CreditCard, Info } from 'lucide-react';
import moment from 'moment';

const BookingConfirmationModal = ({ booking, onConfirm, onCancel }) => {
  const { t } = useTranslation(['common', 'bookingconfirmation']);

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal-content booking-confirmation"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
      >
        <button className="close-button" onClick={onCancel}>
          <X size={24} />
        </button>
        <h2>{t('bookingconfirmation:title')}</h2>
        <div className="booking-details">
          <div className="detail-item">
            <Calendar size={20} />
            <span>{moment(booking.start).format('MMMM D, YYYY')}</span>
          </div>
          <div className="detail-item">
            <Clock size={20} />
            <span>{moment(booking.start).format('h:mm A')} - {moment(booking.end).format('h:mm A')}</span>
          </div>
          <div className="detail-item">
            <User size={20} />
            <span>{booking.coachName}</span>
          </div>
          <div className="detail-item">
            <Info size={20} />
            <span>{booking.sessionTypeName}</span>
          </div>
          <div className="detail-item">
            <CreditCard size={20} />
            <span>{t('bookingconfirmation:price', { price: booking.price })}</span>
          </div>
        </div>
        <div className="booking-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {t('common:cancel')}
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            {t('bookingconfirmation:confirmBooking')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default BookingConfirmationModal;