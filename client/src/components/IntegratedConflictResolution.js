import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import { AlertTriangle, X, Check, Calendar, Trash2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import PropTypes from 'prop-types';

export default function IntegratedConflictResolution({ conflicts, newBooking, onResolve, onClose }) {
  const { t } = useTranslation(['common', 'managesessions']);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const allBookings = [newBooking, ...conflicts];

  const getSessionTypeName = (booking) => {
    if (booking.sessionType?.name) return booking.sessionType.name;
    if (booking.type) return booking.type;
    return 'Unknown session type';
  };

  const formatBookingTime = (booking) => {
    return `${moment(booking.start).format('MMMM D, YYYY h:mm A')} - ${moment(booking.end).format('h:mm A')}`;
  };

  const handleConfirm = () => {
    if (selectedBooking) {
      setShowConfirmation(true);
    }
  };

  const handleFinalConfirm = () => {
    if (selectedBooking) {
      const bookingsToRemove = allBookings.filter(b => b !== selectedBooking);
      onResolve(selectedBooking, bookingsToRemove);
    }
  };

  const renderBookingSummary = (booking, isSelected = false) => (
    <div className={`p-3 border rounded ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <div className="font-semibold">
        {booking.title || t(`managesessions:${getSessionTypeName(booking)}`)}
      </div>
      <div className="text-sm text-gray-600 flex items-center">
        <Calendar size={14} className="mr-1" />
        {formatBookingTime(booking)}
      </div>
      {booking === newBooking && (
        <span className="inline-block bg-green-500 text-white text-xs px-2 py-1 rounded mt-1">
          {t('managesessions:new')}
        </span>
      )}
    </div>
  );

  return (
    <Dialog.Root open={true} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto z-50">

          <Dialog.Title className="text-lg font-semibold mb-4 flex items-center">
    <AlertTriangle className="mr-2 text-yellow-500" />
    {t('managesessions:conflictDetected')}
  </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </Dialog.Close>

          {!showConfirmation ? (
            <>
              <p className="mb-4">
                {allBookings.length > 1
                  ? t('managesessions:chooseBookingToKeep')
                  : t('managesessions:confirmNewBooking')}
              </p>

              <ul className="space-y-2 mb-4">
                {allBookings.map((booking, index) => (
                  <li
                    key={booking._id || `new-booking-${index}`}
                    className={`cursor-pointer ${
                      selectedBooking === booking ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedBooking(booking)}
                  >
                    {renderBookingSummary(booking, selectedBooking === booking)}
                  </li>
                ))}
              </ul>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  disabled={!selectedBooking}
                >
                  <Check size={16} className="mr-2 inline" />
                  {allBookings.length > 1 ? t('managesessions:keepSelected') : t('common:confirm')}
                </button>
                <Dialog.Close asChild>
                  <button className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400">
                    {t('common:cancel')}
                  </button>
                </Dialog.Close>
              </div>
            </>
          ) : (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
              <p className="font-semibold mb-4">{t('managesessions:confirmCancellation', { count: allBookings.length - 1 })}</p>
              
              <div className="mb-4">
                <h4 className="font-semibold mb-2">{t('managesessions:bookingToKeep')}:</h4>
                {renderBookingSummary(selectedBooking, true)}
              </div>

              <div className="mb-4">
                <h4 className="font-semibold mb-2">{t('managesessions:bookingsToCancel')}:</h4>
                <ul className="space-y-2">
                  {allBookings.filter(b => b !== selectedBooking).map((booking, index) => (
                    <li key={booking._id || `cancel-booking-${index}`}>
                      {renderBookingSummary(booking)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={handleFinalConfirm}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  <Trash2 size={16} className="mr-2 inline" />
                  {t('managesessions:confirmAndCancelConflicts')}
                </button>
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                >
                  {t('common:goBack')}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

IntegratedConflictResolution.propTypes = {
  conflicts: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    title: PropTypes.string,
    start: PropTypes.instanceOf(Date),
    end: PropTypes.instanceOf(Date),
    sessionType: PropTypes.shape({
      name: PropTypes.string
    }),
    type: PropTypes.string
  })).isRequired,
  newBooking: PropTypes.shape({
    _id: PropTypes.string,
    title: PropTypes.string,
    start: PropTypes.instanceOf(Date),
    end: PropTypes.instanceOf(Date),
    sessionType: PropTypes.shape({
      name: PropTypes.string
    }),
    type: PropTypes.string
  }).isRequired,
  onResolve: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};