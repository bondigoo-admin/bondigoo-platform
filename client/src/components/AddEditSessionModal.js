import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Save, Trash2, Calendar as CalendarIcon, Loader2, ChevronDown, X, PlusCircle, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from 'react-query';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { deleteSession } from '../services/bookingAPI';
import { getUserConnections } from '../services/connectionAPI';
import { getSessionTypes, getTranslations } from '../services/adminAPI';
import { isOverlapping } from '../utils/calendarHelpers';
import { logger } from '../utils/logger.js';
import ErrorBoundary from './ErrorBoundary';
import { calculateForDisplay } from '../services/priceAPI';
import EarningsBreakdown from './shared/EarningsBreakdown';

import OneOnOneSessionForm from './sessionForms/OneOnOneSessionForm';
import GroupSessionForm from './sessionForms/GroupSessionForm';
import WorkshopSessionForm from './sessionForms/WorkshopSessionForm';
import WebinarSessionForm from './sessionForms/WebinarSessionForm';
import IntegratedConflictResolution from './IntegratedConflictResolution';

import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from './ui/dialog.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Switch } from './ui/switch.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';
import { Calendar } from './ui/calendar.jsx';
import { cn } from '../lib/utils';

const roundUpToNextQuarterHour = (date) => {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;
  d.setMinutes(roundedMinutes, 0, 0);
  if (roundedMinutes >= 60) { // Rolled over to next hour
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
  }
  return d;
};

const baseFormData = {
  type: '',
  title: '', 
  description: '', 
  start: new Date(), 
  end: new Date(new Date().setHours(new Date().getHours() + 1)), 
  slots: [{ start: new Date(), end: new Date(new Date().setHours(new Date().getHours() + 1)) }], 
   webinarSlots: [{ 
    date: new Date(), 
    startTime: roundUpToNextQuarterHour(new Date()), 
    endTime: new Date(roundUpToNextQuarterHour(new Date()).getTime() + 60 * 60 * 1000) 
  }],
  price: '',
  currency: 'CHF',
  isOnline: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  status: 'scheduled',
  location: '',
  isRecurring: false,
  recurringPattern: 'daily',
  recurringEndDate: new Date(new Date().setDate(new Date().getDate() + 30)),
  earlyBirdDeadline: null,
  earlyBirdPrice: '',
  userId: null,
  userIds: [],
  platform: 'coachconnect', 
  isPublic: true, 
  availableForInstantBooking: true, 
  showInWebinarBrowser: true,
  titlePicture: null, 
  courseMaterials: [], 
  webinarLanguage: '', 
  sessionGoal: '',
  clientNotes: '',
  preparationRequired: '',
  followUpTasks: '',
  minAttendees: '1', 
  maxAttendees: '',
  sessionTopic: '',
  prerequisites: '',
  webinarLink: '', 
  learningObjectives: '',
  materialsProvided: '',
  whatToBring: '',
  skillLevel: 'allLevels', 
};

const typeSpecificFields = {
  '66ec4ea477bec414bf2b8859': ['sessionGoal', 'clientNotes', 'preparationRequired', 'followUpTasks'], // 1 on 1
  '66ec54f44a8965b22af33fd5': ['minAttendees', 'maxAttendees', 'sessionTopic', 'prerequisites', 'earlyBirdDeadline', 'earlyBirdPrice'], // Group
  '66ec54f94a8965b22af33fd9': ['webinarTitle', 'webinarPlatform', 'webinarLink', 'earlyBirdDeadline', 'earlyBirdPrice'], // Webinar
  '66ec54fe4a8965b22af33fdd': ['workshopTitle', 'learningObjectives', 'materialsProvided', 'whatToBring', 'skillLevel', 'earlyBirdDeadline', 'earlyBirdPrice'], // Workshop
};

// Add this helper object inside the component or make it accessible
const currencySymbols = {
  USD: '$',
  EUR: '€',
  CHF: 'CHF',
  GBP: '£',
};

export default function AddEditSessionModal({ isOpen, onClose, onSave, onDelete, sessionData = null, coachId = '', existingSessions = [], coachSettings = { platformFeePercentage: 10, vatRate: 7.7, vatIncludedInPrice: false, defaultCurrency: 'CHF' }  }) {
  const { t, i18n } = useTranslation(['common', 'managesessions', 'payments']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(baseFormData);
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState('basicInfo');
  const [showConflictResolution, setShowConflictResolution] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState([]);
 const [debouncedValues, setDebouncedValues] = useState({ price: formData.price, earlyBirdPrice: formData.earlyBirdPrice });

  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);

  const { user } = useAuth();
  const effectiveCoachId = coachId || user?._id; // Fallback to authenticated user ID
  const isMultiSlotType = formData.type === '66ec54f44a8965b22af33fd5' || // Group
                          formData.type === '66ec54f94a8965b22af33fd9' || // Webinar
                          formData.type === '66ec54fe4a8965b22af33fdd';   // Workshop
  const queryStart = isMultiSlotType && formData.slots.length > 0 ? formData.slots[0].start : formData.start;
  const queryEnd = isMultiSlotType && formData.slots.length > 0 ? formData.slots[0].end : formData.end;

  const getEffectiveStartDate = useCallback((currentFormData) => {
    if (currentFormData.type === '66ec54f94a8965b22af33fd9') { // Webinar
    if (currentFormData.webinarSlots && currentFormData.webinarSlots.length > 0 && currentFormData.webinarSlots[0].date && currentFormData.webinarSlots[0].startTime) {
    const firstSlotDate = new Date(currentFormData.webinarSlots[0].date);
    const firstSlotStartTime = new Date(currentFormData.webinarSlots[0].startTime);
    return new Date(firstSlotDate.getFullYear(), firstSlotDate.getMonth(), firstSlotDate.getDate(), firstSlotStartTime.getHours(), firstSlotStartTime.getMinutes());
    }
    } else if (currentFormData.type === '66ec54f44a8965b22af33fd5' || currentFormData.type === '66ec54fe4a8965b22af33fdd') { // Group or Workshop
    if (currentFormData.slots && currentFormData.slots.length > 0 && currentFormData.slots[0].start) {
    return new Date(currentFormData.slots[0].start);
    }
    }
    return currentFormData.start ? new Date(currentFormData.start) : null; // Fallback for 1-on-1 or if slots are empty
    }, []);

    useEffect(() => {
    const handler = setTimeout(() => {
        setDebouncedValues({
            price: formData.price,
            earlyBirdPrice: formData.earlyBirdPrice
        });
    }, 500);

    return () => {
        clearTimeout(handler);
    };
}, [formData.price, formData.earlyBirdPrice]);

     useEffect(() => {
    logger.info(`[AddEditSessionModal] Rendered. isOpen prop is: ${isOpen}`);
  }, [isOpen]);

  const { data: connections, isLoading: isLoadingConnections, error: connectionsError } = useQuery(
    ['connections', user?._id],
    () => getUserConnections(user?._id),
    {
      enabled: !!user?._id && isOpen,
      onError: (error) => {
        logger.error('[AddEditSessionModal] Error fetching connections:', error);
        toast.error(t('managesessions:errorFetchingConnections'));
      },
    }
  );

  const { data: sessionTypes, isLoading: isLoadingTypes } = useQuery('sessionTypes', getSessionTypes, {
    enabled: isOpen,
    onError: (error) => {
      logger.error('[AddEditSessionModal] Error fetching session types:', error);
      toast.error(t('managesessions:errorFetchingSessionTypes'));
    }
  });

  const { data: sessionTypeTranslations } = useQuery(
    ['sessionTypeTranslations', i18n.language],
    () => getTranslations('sessionTypes', i18n.language),
    {
      enabled: !!sessionTypes && isOpen,
      onError: (error) => {
        logger.error('[AddEditSessionModal] Error fetching translations:', error);
        toast.error(t('managesessions:errorFetchingTranslations'));
      },
      retry: false
    }
  );

const { data: priceBreakdownData, isLoading: isLoadingPrice } = useQuery(
    ['sessionPriceBreakdown', debouncedValues.price, debouncedValues.earlyBirdPrice, formData.currency, effectiveCoachId, formData.type],
    () => {
      const queryStart = isMultiSlotType && formData.slots.length > 0 ? formData.slots[0].start : formData.start;
      const queryEnd = isMultiSlotType && formData.slots.length > 0 ? formData.slots[0].end : formData.end;

      const params = {
          price: parseFloat(debouncedValues.price) || 0,
          currency: formData.currency,
          userId: effectiveCoachId,
          sessionTypeId: formData.type,
          start: queryStart,
          end: queryEnd,
          timezone: formData.timezone
      };

      if (debouncedValues.earlyBirdPrice && parseFloat(debouncedValues.earlyBirdPrice) > 0) {
          params.earlyBirdPrice = parseFloat(debouncedValues.earlyBirdPrice);
      }

      return calculateForDisplay(params);
    },
    {
      enabled: (
          (!!debouncedValues.price && parseFloat(debouncedValues.price) >= 0) ||
          (!!debouncedValues.earlyBirdPrice && parseFloat(debouncedValues.earlyBirdPrice) >= 0)
        ) && !!formData.type && !!effectiveCoachId,
      staleTime: Infinity,
      cacheTime: 10 * 60 * 1000,
      onError: (error) => {
          logger.error('Error fetching price breakdown:', error);
      }
    }
);

useEffect(() => {
    if (sessionData || !isOpen) {
        setDebouncedValues({
            price: sessionData?.price || baseFormData.price,
            earlyBirdPrice: sessionData?.earlyBirdPrice || baseFormData.earlyBirdPrice
        });
    }
}, [sessionData, isOpen]);
  

 const connectedClients = Array.isArray(connections)
  ? connections.filter(conn => conn.status === 'accepted' && conn.otherUser).map(conn => conn.otherUser)
  : [];

 useEffect(() => {
    logger.info('[AddEditSessionModal] Initializing form with session data', {
      sessionData: {
        _id: sessionData?._id,
        start: sessionData?.start?.toISOString(),
        end: sessionData?.end?.toISOString(),
        webinarSlots: sessionData?.webinarSlots,
        slotIndex: sessionData?.slotIndex,
        originalBookingId: sessionData?.originalBookingId,
        sessionImages: sessionData?.sessionImages?.map(img => ({ ...img, isMain: img.isMain || false })),
      },
    });
    if (isOpen) {
      if (sessionData) {
        const defaultSlots = [{ start: baseFormData.start, end: baseFormData.end }];
         const defaultWebinarSlots = [{ 
        date: new Date(), 
        startTime: roundUpToNextQuarterHour(new Date()), 
        endTime: new Date(roundUpToNextQuarterHour(new Date()).getTime() + 60 * 60 * 1000) 
      }];
        
        const sessionTypeIdentifier = sessionData.type || sessionData.sessionTypeId;
        logger.debug('[AddEditSessionModal] Populating formData from sessionData (using generic title/desc)', { sessionDataId: sessionData._id, sessionTypeIdentifier });
    
        setFormData(prevData => ({
          ...baseFormData, 
          ...prevData, 
          ...sessionData, 
          type: sessionTypeIdentifier || baseFormData.type,
          title: sessionData.title || baseFormData.title, 
          description: sessionData.description || baseFormData.description, 
          platform: sessionData.platform || baseFormData.platform, 
          start: sessionData.start ? new Date(sessionData.start) : baseFormData.start,
          end: sessionData.end ? new Date(sessionData.end) : baseFormData.end,
          slots: sessionData.slots && sessionData.slots.length > 0
                 ? sessionData.slots.map(s => ({ start: new Date(s.start), end: new Date(s.end) }))
                 : defaultSlots,
           webinarSlots: sessionData.webinarSlots && sessionData.webinarSlots.length > 0
             ? sessionData.webinarSlots.map(s => ({ 
                 date: s.date ? new Date(s.date) : new Date(), 
                 startTime: s.startTime ? new Date(s.startTime) : roundUpToNextQuarterHour(new Date()), 
                 endTime: s.endTime ? new Date(s.endTime) : new Date(roundUpToNextQuarterHour(new Date()).getTime() + 60 * 60 * 1000) 
               }))
             : defaultWebinarSlots,
          recurringEndDate: sessionData.recurringEndDate ? new Date(sessionData.recurringEndDate) : baseFormData.recurringEndDate,
          earlyBirdDeadline: sessionData.earlyBirdDeadline ? new Date(sessionData.earlyBirdDeadline) : null,
          price: sessionData.price ?? baseFormData.price,
          currency: sessionData.currency || coachSettings?.defaultCurrency || baseFormData.currency,
          earlyBirdPrice: sessionData.earlyBirdPrice ?? '',
          isRecurring: sessionData.isRecurring ?? false,
          userId: sessionData.userId || null, 
          userIds: sessionData.userIds || [], 
          isPublic: sessionData.isPublic !== undefined ? sessionData.isPublic : baseFormData.isPublic,
          availableForInstantBooking: sessionData.availableForInstantBooking !== undefined ? sessionData.availableForInstantBooking : baseFormData.availableForInstantBooking,
          showInWebinarBrowser: sessionData.showInWebinarBrowser !== undefined ? sessionData.showInWebinarBrowser : baseFormData.showInWebinarBrowser,
          titlePicture: null, // Deprecated in favor of sessionImages
          sessionImages: (sessionData.sessionImages || []).map(img => ({
            ...img,
            isMain: img.isMain || false,
            // if it's existing image, url, publicId, _id should be present
          })),
          courseMaterials: sessionData.courseMaterials && sessionData.courseMaterials.length > 0 ? sessionData.courseMaterials : [],
          webinarLanguage: sessionData.webinarLanguage || baseFormData.webinarLanguage,
          sessionGoal: sessionData.sessionGoal || baseFormData.sessionGoal,
          clientNotes: sessionData.clientNotes || baseFormData.clientNotes,
          preparationRequired: sessionData.preparationRequired || baseFormData.preparationRequired,
          followUpTasks: sessionData.followUpTasks || baseFormData.followUpTasks,
          minAttendees: sessionData.minAttendees ?? baseFormData.minAttendees,
          maxAttendees: sessionData.maxAttendees ?? baseFormData.maxAttendees,
          sessionTopic: sessionData.sessionTopic || baseFormData.sessionTopic,
          prerequisites: sessionData.prerequisites || baseFormData.prerequisites,
          webinarLink: sessionData.webinarLink || baseFormData.webinarLink,
          learningObjectives: sessionData.learningObjectives || baseFormData.learningObjectives,
          materialsProvided: sessionData.materialsProvided || baseFormData.materialsProvided,
          whatToBring: sessionData.whatToBring || baseFormData.whatToBring,
          skillLevel: sessionData.skillLevel || baseFormData.skillLevel,
        }));
      } else {
        logger.debug('[AddEditSessionModal] Initializing formData for new session (using generic title/desc)');
        const initialWebinarSlots = [{ 
        date: new Date(), 
        startTime: roundUpToNextQuarterHour(new Date()), 
        endTime: new Date(roundUpToNextQuarterHour(new Date()).getTime() + 60 * 60 * 1000) 
      }];
        setFormData({...baseFormData, sessionImages: [], webinarSlots: initialWebinarSlots, currency: coachSettings?.defaultCurrency || baseFormData.currency });
      }
      setErrors({});
      setActiveTab('basicInfo');
    }
     // Cleanup preview URLs
     return () => {
      formData.sessionImages?.forEach(img => {
        if (img.previewUrl) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
  }, [sessionData, isOpen, coachSettings]);

  const getTranslatedSessionTypeName = useCallback((typeId) => {
    if (!sessionTypes) return '';
    const type = sessionTypes.find(t => t.id === typeId);
    if (!type) return '';

    const translationKey = `sessionTypes_${typeId}`;
    return sessionTypeTranslations?.translations?.[translationKey]?.translation || type.name;
  }, [sessionTypes, sessionTypeTranslations]);

  const validateField = (field, value) => {
    let newErrors = { ...errors };
    switch (field) {
      case 'type':
        if (!value) newErrors.type = t('managesessions:typeRequired');
        else delete newErrors.type;
        break;
      case 'title':
        if (!value.trim()) newErrors.title = t('managesessions:titleRequired');
        else delete newErrors.title;
        break;
      case 'start':
      case 'end':
        if (!value) newErrors[field] = t(`managesessions:${field}Required`);
        else if (field === 'end' && formData.start && value <= formData.start) newErrors.end = t('managesessions:endTimeAfterStart');
        else {
            delete newErrors.start;
            delete newErrors.end;
        }
        break;
      case 'price':
        if (value !== '' && parseFloat(value) < 0) newErrors.price = t('managesessions:priceNonNegative');
        else delete newErrors.price;
        break;
      case 'earlyBirdPrice':
        if (value !== '' && parseFloat(value) < 0) newErrors.earlyBirdPrice = t('managesessions:priceNonNegative');
        else delete newErrors.earlyBirdPrice;
        break;
    }
    setErrors(newErrors);
  };

const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    logger.info('[AddEditSessionModal] Input change', { name, type, value: type === 'file' ? e.target.files?.[0]?.name : value });

    if (errors[name]) {
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
        });
    }
    
    setFormData(prev => {
      let newValues = {};
      if (name.startsWith('slots.')) {
        // ... (existing slot logic)
        const [_, index, fieldName] = name.match(/slots\.(\d+)\.(start|end)/);
        const updatedSlots = [...prev.slots];
        const dateValue = value ? new Date(value) : null;
        updatedSlots[parseInt(index)] = {
          ...updatedSlots[parseInt(index)],
          [fieldName]: dateValue,
        };
        if (fieldName === 'start' && dateValue && updatedSlots[parseInt(index)].end && dateValue > updatedSlots[parseInt(index)].end) {
            updatedSlots[parseInt(index)].end = new Date(dateValue.getTime() + 60 * 60 * 1000);
        }
        newValues = { slots: updatedSlots };
      } else if (name === 'userIds') {
        newValues = { [name]: value };
      } else if (type === 'checkbox') {
        newValues = { [name]: checked };
      } else if (name === 'sessionImages_new_file' && type === 'file') {
          const newImageFiles = Array.from(e.target.files);
          const existingImages = (prev.sessionImages || []).map(img => ({...img, isMain: img.isMain || false}));
          
          existingImages.forEach(img => {
            if (img.file && img.previewUrl && !newImageFiles.find(nf => nf.name === img.file.name && nf.size === img.file.size)) { 
            }
          });

          const newImageObjects = newImageFiles.map(file => ({
              file,
              name: file.name,
              isMain: false,
              previewUrl: URL.createObjectURL(file),
              _tempId: Date.now() + Math.random().toString(36).substr(2, 9) 
          }));
          
          let combinedImages = [...existingImages, ...newImageObjects];
          newValues = { sessionImages: combinedImages };

      } else if (name === 'sessionImages_delete_id' && type === 'action') {
       const itemToDelete = value; 
          const itemToDeleteIdentifier = itemToDelete._tempId || itemToDelete._id || itemToDelete.publicId;
          
          const updatedSessionImages = (prev.sessionImages || []).filter(img => {
              const currentIdentifier = img._tempId || img._id || img.publicId;
              if (currentIdentifier === itemToDeleteIdentifier) {
                  if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); 
                  return false;
              }
              return true;
          });
          newValues = { sessionImages: updatedSessionImages };

      } else if (name === 'sessionImages_set_main_id' && type === 'action') {
           const itemToSetMain = value;
          const itemToSetMainIdentifier = itemToSetMain._tempId || itemToSetMain._id || itemToSetMain.publicId;
          
          newValues = {
              sessionImages: (prev.sessionImages || []).map(img => {
                  const currentIdentifier = img._tempId || img._id || img.publicId;
                  return { ...img, isMain: currentIdentifier === itemToSetMainIdentifier };
              })
          };
      } else if (name === 'sessionImages_reordered' && type === 'action') {
          newValues = { sessionImages: value }; // value is the new reordered array
 } else if (type === 'file') { 
        if (name === 'courseMaterials') {
            const newFiles = Array.from(e.target.files);
            const newFileObjectsForFormData = newFiles.map(file => ({
              file, // The actual File object
              name: file.name,
              _tempId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              // This object represents a new, not-yet-uploaded file in the form's state
            }));
            
            // prev.courseMaterials contains a mix of:
            // 1. Existing materials (metadata from DB: {url, publicId, name, ...})
            // 2. Previously added new files (already in {file, name, _tempId} format)
            const updatedCourseMaterials = [
              ...(prev.courseMaterials || []),
              ...newFileObjectsForFormData
            ];
            newValues = { [name]: updatedCourseMaterials };
        } else if (name === 'titlePicture') { 
           logger.warn("Accessing deprecated titlePicture input");
             if (e.target.files[0]) {
                const file = e.target.files[0];
                const newImageEntry = {
                    file,
                    name: file.name,
                    isMain: true, // Title picture is implicitly main
                    previewUrl: URL.createObjectURL(file),
                    _tempId: Date.now() + Math.random().toString(36).substr(2, 9)
                };
                // If prev.sessionImages exists and has a main image that's a file, remove it before adding new
                const existingImages = (prev.sessionImages || []).filter(img => !(img.isMain && img.file));

                newValues = { 
                    sessionImages: [...existingImages, newImageEntry],
                    titlePicture: file // Keep for legacy if needed, but sessionImages is primary
                };
            } else {
                newValues = { 
                     sessionImages: prev.sessionImages?.filter(img => !(img.isMain && img.file)), 
                     titlePicture: null 
                 }; 
            }
        }
      } else if (name === 'type') {
        const newType = value;
        const typeSpecificDefaults = {};
        const newTypeFields = typeSpecificFields[newType] || [];
        newTypeFields.forEach(field => {
          typeSpecificDefaults[field] = prev[field] !== undefined ? prev[field] : (baseFormData[field] || '');
        });
    
        const clientReset = (newType === '66ec4ea477bec414bf2b8859') ? {} : { userId: null, userIds: [] };
        
        newValues = { 
            type: newType, 
            ...typeSpecificDefaults, 
            ...clientReset,
            title: prev.title || baseFormData.title, 
            description: prev.description || baseFormData.description,
        };
        if (value === '66ec54f94a8965b22af33fd9') { 
            newValues.webinarTitle = prev.title || baseFormData.webinarTitle;
            newValues.webinarDescription = prev.description || baseFormData.webinarDescription;
            newValues.title = baseFormData.title;
            newValues.description = baseFormData.description;
        } else {
            newValues.title = prev.webinarTitle || baseFormData.title;
            newValues.description = prev.webinarDescription || baseFormData.description;
            newValues.webinarTitle = baseFormData.webinarTitle;
            newValues.webinarDescription = baseFormData.webinarDescription;
        }

      } else {
        newValues = { [name]: value };
      }
      return { ...prev, ...newValues };
    });
  }, [errors]);

const handleRemoveCourseMaterial = useCallback((itemToRemoveIdentifier) => { // Pass _tempId or _id
    setFormData(prev => {
        const updatedMaterials = prev.courseMaterials.filter(material => {
            const currentIdentifier = material._tempId || material._id?.toString() || material.publicId;
            return currentIdentifier !== itemToRemoveIdentifier;
        });
        logger.info('[AddEditSessionModal] Course material removed', { 
            itemToRemoveIdentifier,
            remainingCount: updatedMaterials.length 
        });
        return { ...prev, courseMaterials: updatedMaterials };
    });
  }, []);

  const handleSlotDateChange = useCallback((date, index, field) => {
    setFormData(prev => {
      const updatedSlots = [...prev.slots];
      updatedSlots[index] = { ...updatedSlots[index], [field]: date };
      if (field === 'start' && date && updatedSlots[index].end && date > updatedSlots[index].end) {
        updatedSlots[index].end = new Date(date.getTime() + 60 * 60 * 1000);
      }
      return { ...prev, slots: updatedSlots };
    });
    // No individual field validation for slots here, validateForm will handle it
  }, []);

  const addSlot = () => {
    setFormData(prev => ({
      ...prev,
      slots: [...prev.slots, { start: new Date(), end: new Date(new Date().setHours(new Date().getHours() + 1)) }]
    }));
  };

  const removeSlot = (index) => {
    setFormData(prev => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== index)
    }));
  };

const handleWebinarSlotChange = useCallback((index, field, value) => {
    setFormData(prev => {
        const updatedWebinarSlots = [...prev.webinarSlots];
        const currentSlot = { ...updatedWebinarSlots[index] };

        if (field === 'date') {
            currentSlot.date = value;
            if (currentSlot.startTime && value) {
                const newStartTime = new Date(currentSlot.startTime);
                newStartTime.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
                currentSlot.startTime = newStartTime;
            }
            if (currentSlot.endTime && value) {
                const newEndTime = new Date(currentSlot.endTime);
                newEndTime.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
                currentSlot.endTime = newEndTime;
            }
        } else if (field === 'startTime') {
            currentSlot.startTime = value;
            if (value && !currentSlot.endTime) {
                currentSlot.endTime = new Date(value.getTime() + 60 * 60 * 1000);
            } else if (currentSlot.endTime && value >= currentSlot.endTime) {
                const newEndTime = new Date(value.getTime() + 60 * 60 * 1000); 
                currentSlot.endTime = newEndTime;
            }
        } else if (field === 'endTime') {
            currentSlot.endTime = value;
        }
        
        updatedWebinarSlots[index] = currentSlot;
        return { ...prev, webinarSlots: updatedWebinarSlots };
    });
  }, []);

const handleAddWebinarSlot = () => {
  setFormData(prev => {
      const existingSlots = prev.webinarSlots;
      let newDate = new Date();
      let newStartTime, newEndTime;

      if (existingSlots.length > 0) {
          const previousSlot = existingSlots[existingSlots.length - 1];
          newDate = previousSlot.date ? new Date(previousSlot.date) : new Date();

          if (previousSlot.endTime) {
              const previousEndTime = new Date(previousSlot.endTime);
              newStartTime = roundUpToNextQuarterHour(new Date(previousEndTime.getTime())); // Start after previous, rounded up
              
              newStartTime.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());

              newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000); 

              const endOfDayCap = new Date(newDate);
              endOfDayCap.setHours(23, 59, 59, 999); 
              if (newEndTime > endOfDayCap) {
                  newEndTime = endOfDayCap;
                  if (newEndTime.getTime() - newStartTime.getTime() < 15 * 60000) { 
                      newStartTime = new Date(newEndTime.getTime() - 15 * 60000);
                      if (newStartTime < new Date(newDate).setHours(0,0,0,0)) { // Prevent going to previous day
                        newStartTime = new Date(newDate).setHours(0,0,0,0);
                      }
                  }
              }
               if (newStartTime < previousEndTime && 
                  newStartTime.toDateString() === previousEndTime.toDateString()) {
                   newStartTime = roundUpToNextQuarterHour(new Date(previousEndTime.getTime())); 
                   newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000);
                   if (newEndTime > endOfDayCap) newEndTime = endOfDayCap;
               }

          } else {
              newStartTime = roundUpToNextQuarterHour(new Date(newDate).setHours(9, 0, 0, 0));
              newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000);
          }
      } else {
          newStartTime = roundUpToNextQuarterHour(new Date(newDate).setHours(9, 0, 0, 0));
          newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000); 
      }
      
      const finalStartTime = new Date(newDate);
      finalStartTime.setHours(newStartTime.getHours(), newStartTime.getMinutes(), 0, 0);

      const finalEndTime = new Date(newDate);
      finalEndTime.setHours(newEndTime.getHours(), newEndTime.getMinutes(), 0, 0);
      
      if (finalEndTime <= finalStartTime) {
          finalEndTime.setTime(finalStartTime.getTime() + 60 * 60 * 1000);
           const endOfDayCap = new Date(newDate);
           endOfDayCap.setHours(23, 59, 59, 999);
           if (finalEndTime > endOfDayCap) {
               finalEndTime.setTime(endOfDayCap.getTime());
               // If capping endTime makes it equal or before startTime, adjust startTime
               if (finalEndTime <= finalStartTime) {
                   finalStartTime.setTime(finalEndTime.getTime() - 60 * 60 * 1000);
                    if (finalStartTime < new Date(newDate).setHours(0,0,0,0)) {
                        finalStartTime.setTime(new Date(newDate).setHours(0,0,0,0));
                    }
               }
           }
      }

      return {
          ...prev,
          webinarSlots: [
              ...existingSlots,
              { date: newDate, startTime: finalStartTime, endTime: finalEndTime, _tempId: `slot_${Date.now()}` }
          ]
      };
  });
};

  const handleRemoveWebinarSlot = (index) => {
      setFormData(prev => ({
          ...prev,
          webinarSlots: prev.webinarSlots.filter((_, i) => i !== index)
      }));
  };

const validateForm = useCallback(() => {
    let newErrors = {};
    if (!formData.type) {
        newErrors.type = t('managesessions:typeRequired');
    }

    const isWebinarType = formData.type === '66ec54f94a8965b22af33fd9';
    const isOneOnOneType = formData.type === '66ec4ea477bec414bf2b8859';
    const isGenericMultiSlotType = formData.type === '66ec54f44a8965b22af33fd5' || formData.type === '66ec54fe4a8965b22af33fdd';

    if (!formData.title.trim() && (isWebinarType || isOneOnOneType || isGenericMultiSlotType)) {
        newErrors.title = isWebinarType ? t('managesessions:webinarTitleRequired', 'Webinar title is required.') : t('managesessions:titleRequired');
    }
    if (formData.price !== '' && parseFloat(formData.price) < 0) newErrors.price = t('managesessions:priceNonNegative');
    if (!formData.timezone) newErrors.timezone = t('managesessions:timezoneRequired');

    const effectiveStartDate = getEffectiveStartDate(formData);
    if (formData.earlyBirdDeadline && effectiveStartDate && new Date(formData.earlyBirdDeadline) >= effectiveStartDate) {
        newErrors.earlyBirdDeadline = t('managesessions:earlyBirdDeadlineBeforeStart');
    }
    if (formData.earlyBirdPrice !== '' && parseFloat(formData.earlyBirdPrice) < 0) newErrors.earlyBirdPrice = t('managesessions:priceNonNegative');

    if (isWebinarType) {
        if (!formData.webinarLanguage) {
            newErrors.webinarLanguage = t('managesessions:languageRequired', 'Language is required.');
        }
        if (!formData.webinarSlots || formData.webinarSlots.length === 0) {
            newErrors.webinarSlots = t('managesessions:atLeastOneWebinarSlotRequired');
        } else {
            formData.webinarSlots.forEach((slot, index) => {
                if (!slot.date) newErrors[`webinarSlot_date_${index}`] = t('managesessions:dateRequired');
                if (!slot.startTime) newErrors[`webinarSlot_startTime_${index}`] = t('managesessions:startTimeRequired');
                if (!slot.endTime) newErrors[`webinarSlot_endTime_${index}`] = t('managesessions:endTimeRequired');
                if (slot.endTime && slot.startTime && new Date(slot.endTime) <= new Date(slot.startTime)) {
                    newErrors[`webinarSlot_endTime_${index}`] = t('managesessions:endTimeAfterStartTimeInSlot');
                }
            });
        }
    } else if (isGenericMultiSlotType) {
        if (!formData.slots || formData.slots.length === 0) {
            newErrors.slots = t('managesessions:atLeastOneSlotRequired');
        } else {
            formData.slots.forEach((slot, index) => {
                if (!slot.start) newErrors[`slot_start_${index}`] = t('managesessions:startTimeRequired');
                if (!slot.end) newErrors[`slot_end_${index}`] = t('managesessions:endTimeRequired');
                if (slot.end && slot.start && new Date(slot.end) <= new Date(slot.start)) newErrors[`slot_end_${index}`] = t('managesessions:endTimeAfterStart');
            });
        }
        if (formData.minAttendees && parseInt(formData.minAttendees, 10) < 1) newErrors.minAttendees = t('managesessions:minAttendeesPositive');
        if (formData.maxAttendees && parseInt(formData.maxAttendees, 10) < 1) newErrors.maxAttendees = t('managesessions:maxAttendeesPositive');
        if (formData.minAttendees && formData.maxAttendees && parseInt(formData.minAttendees, 10) > parseInt(formData.maxAttendees, 10)) {
            newErrors.maxAttendees = t('managesessions:maxAttendeesGreaterThanMin');
        }
    } else if (isOneOnOneType) {
        if (!formData.start) newErrors.start = t('managesessions:startTimeRequired');
        if (!formData.end) newErrors.end = t('managesessions:endTimeRequired');
        if (formData.end && formData.start && new Date(formData.end) <= new Date(formData.start)) newErrors.end = t('managesessions:endTimeAfterStart');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, t, getEffectiveStartDate]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !modalRef.current) return;
      
      const newX = e.clientX - dragStartOffset.x;
      const newY = e.clientY - dragStartOffset.y;
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartOffset]);

  useEffect(() => {
    if (!isOpen) {
      setIsPositionManagedByJS(false); 
    }
  }, [isOpen]);

  useEffect(() => {
    if (modalRef.current) {
      if (isPositionManagedByJS) {
        modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
        modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
        modalRef.current.style.setProperty('transform', 'none', 'important');
        modalRef.current.style.setProperty('margin', '0px', 'important');
      } else {
        modalRef.current.style.removeProperty('top');
        modalRef.current.style.removeProperty('left');
        modalRef.current.style.removeProperty('transform');
        modalRef.current.style.removeProperty('margin');
      }
    }
  }, [isPositionManagedByJS, position]);

  const handleMouseDownOnTitle = (e) => {
    if (e.button !== 0 || !modalRef.current) return; 

    const modalRect = modalRef.current.getBoundingClientRect();
    
    const currentStartX = isPositionManagedByJS ? position.x : modalRect.left;
    const currentStartY = isPositionManagedByJS ? position.y : modalRect.top;

    if (!isPositionManagedByJS) {
      setPosition({ x: currentStartX, y: currentStartY });
      setIsPositionManagedByJS(true);        
    }
    
    setIsDragging(true);
    setDragStartOffset({
      x: e.clientX - currentStartX, 
      y: e.clientY - currentStartY,
    });
    e.preventDefault();
  };

   const handleSubmit = async (e) => {
    e.preventDefault();
    logger.info('[AddEditSessionModal] Submit called', { formDataKeys: Object.keys(formData) });
    if (!validateForm()) {
        toast.error(t('managesessions:formValidationFailed'));
        logger.warn('[AddEditSessionModal] Form validation failed', { errors });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const selectedSessionTypeDb = sessionTypes.find(st => st.id === formData.type);
        
        const bookingPayload = {
          coachId: effectiveCoachId,
          sessionTypeId: formData.type, 
          sessionTypeName: selectedSessionTypeDb ? getTranslatedSessionTypeName(selectedSessionTypeDb.id) : undefined,
          title: formData.title || '', 
          description: formData.description || '', 
          start: null, 
          end: null,   
          timezone: formData.timezone,
          status: formData.status || 'scheduled',
          location: formData.location || '',
          isOnline: formData.isOnline || false,
          price: formData.price === '' || formData.price === null || formData.price === undefined ? null : parseFloat(formData.price),
          currency: formData.currency,
          earlyBirdDeadline: formData.earlyBirdDeadline ? formData.earlyBirdDeadline.toISOString() : null,
          earlyBirdPrice: formData.earlyBirdPrice && formData.earlyBirdPrice !== '' ? parseFloat(formData.earlyBirdPrice) : null,
          language: formData.language || null,
          tags: formData.tags || [],
          cancellationPolicy: formData.cancellationPolicy || null,
          isAvailability: false, 
          availableForInstantBooking: formData.availableForInstantBooking,
          firmBookingThreshold: formData.firmBookingThreshold ? parseInt(formData.firmBookingThreshold, 10) : 24,
          isPartOfPackage: formData.isPartOfPackage || false,
          packageId: formData.packageId || null,
          certificationOffered: formData.certificationOffered || false,
          certificationDetails: formData.certificationDetails || null,
          userId: formData.type === '66ec4ea477bec414bf2b8859' ? formData.userId : null, 
          userIds: formData.type === '66ec54f44a8965b22af33fd5' ? formData.userIds : [],   
          sessionGoal: formData.sessionGoal || null,
          clientNotes: formData.clientNotes || null,
          preparationRequired: formData.preparationRequired || null,
          followUpTasks: formData.followUpTasks || null,
          minAttendees: formData.minAttendees ? parseInt(formData.minAttendees, 10) : 0,
          maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees, 10) : 0,
          sessionTopic: formData.sessionTopic || null,
          prerequisites: formData.prerequisites || null,
          learningObjectives: formData.learningObjectives || null,
          materialsProvided: formData.materialsProvided || null,
          whatToBring: formData.whatToBring || null,
          skillLevel: formData.skillLevel || 'allLevels',
        };

        if (formData.type === '66ec4ea477bec414bf2b8859') { 
            bookingPayload.start = formData.start.toISOString();
            bookingPayload.end = formData.end.toISOString();
            bookingPayload.isRecurring = formData.isRecurring;
            bookingPayload.recurringPattern = formData.isRecurring ? formData.recurringPattern : 'none';
            bookingPayload.recurringEndDate = formData.isRecurring && formData.recurringEndDate ? formData.recurringEndDate.toISOString() : null;
        } else if (formData.type === '66ec54f94a8965b22af33fd9') { 
            bookingPayload.webinarPlatform = formData.platform || 'coachconnect'; 
            bookingPayload.webinarLink = formData.webinarLink || null;
            bookingPayload.webinarLanguage = formData.webinarLanguage || null;
            bookingPayload.isPublic = formData.isPublic;
            bookingPayload.showInWebinarBrowser = formData.showInWebinarBrowser;
            bookingPayload.presenterBio = formData.presenterBio || null;
            bookingPayload.qaSession = formData.qaSession || false;
            bookingPayload.recordingAvailable = formData.recordingAvailable || false;
            bookingPayload.replayAccessDuration = formData.replayAccessDuration ? parseInt(formData.replayAccessDuration, 10) : null;
            
            bookingPayload.slots = undefined; 
            bookingPayload.webinarSlots = formData.webinarSlots.map(slot => ({
                date: new Date(slot.startTime).toISOString().split('T')[0],
                startTime: new Date(slot.startTime).toISOString(),
                endTime: new Date(slot.endTime).toISOString()
            }));

            if (formData.webinarSlots.length > 0) {
                const startTimes = formData.webinarSlots.map(s => new Date(s.startTime).getTime());
                const endTimes = formData.webinarSlots.map(s => new Date(s.endTime).getTime());
                bookingPayload.start = new Date(Math.min(...startTimes)).toISOString();
                bookingPayload.end = new Date(Math.max(...endTimes)).toISOString();
            }
        } else if (formData.type === '66ec54f44a8965b22af33fd5' || formData.type === '66ec54fe4a8965b22af33fdd') { 
            bookingPayload.webinarSlots = undefined; 
            bookingPayload.slots = formData.slots.map(slot => ({ start: slot.start.toISOString(), end: slot.end.toISOString() }));
             if (formData.slots.length > 0) { 
              bookingPayload.start = formData.slots[0].start.toISOString();
              bookingPayload.end = formData.slots[formData.slots.length-1].end.toISOString();
            }
        } else {
            logger.warn("[AddEditSessionModal] handleSubmit: Unknown or unset session type for slot/time derivation", { type: formData.type });
            bookingPayload.start = formData.start.toISOString();
            bookingPayload.end = formData.end.toISOString();
        }
        
        if (!bookingPayload.start || !bookingPayload.end) {
            logger.error("[AddEditSessionModal] handleSubmit: Start or End time is null before sending to API.", { start: bookingPayload.start, end: bookingPayload.end, type: formData.type });
            toast.error(t('managesessions:errorSavingSession') + ": " + t('managesessions:errorMissingTimeDerivation'));
            setIsSubmitting(false);
            return;
        }

      const initialSessionImagesMetadata = (formData.sessionImages || []).map(img => {
            if (img.file instanceof File) {
                return { name: img.name, isMain: img.isMain, _tempId: img._tempId || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
            }
            return { url: img.url, publicId: img.publicId, isMain: img.isMain, _id: img._id };
        });
        bookingPayload.sessionImages = initialSessionImagesMetadata;

        const initialCourseMaterialsMetadata = (formData.courseMaterials || []).map(material => {
            if (material.file instanceof File) { // Check if material object contains a File
                const tempId = material._tempId || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                // material.file._tempId = tempId; // Not needed as parent object has _tempId
                return { name: material.name, _tempId: tempId };
            }
            return material; // Existing metadata (e.g. { url, publicId, name, _id })
        });
        bookingPayload.courseMaterials = initialCourseMaterialsMetadata;
        
        const newImageFileObjects = (formData.sessionImages || [])
            .filter(img => img.file instanceof File)
            .map(img => ({ 
                file: img.file, 
                name: img.name, 
                isMain: img.isMain, 
                _tempId: img._tempId || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` 
            }));

        // Corrected construction of newCourseMaterialFileObjects
        const newCourseMaterialFileObjects = (formData.courseMaterials || [])
            .filter(material => material.file instanceof File) // Filter for items that are new file uploads
            .map(material => ({ // material here is an object like { file: FileObject, name: "...", _tempId: "..." }
                file: material.file,
                name: material.name,
                _tempId: material._tempId 
            }));

        if (sessionData?._id) {
            bookingPayload._id = sessionData._id;
        }

        logger.info('[AddEditSessionModal] Final bookingPayload being sent to onSave:', bookingPayload);
        logger.info('[AddEditSessionModal] New image files for onSave:', newImageFileObjects.map(f => f.name));
        logger.info('[AddEditSessionModal] New material files for onSave:', newCourseMaterialFileObjects.map(f => f.name));


        await onSave(
            bookingPayload, 
            newImageFileObjects, 
            newCourseMaterialFileObjects,
            sessionData?.sessionImages || [], 
            sessionData?.courseMaterials || [] 
        );
        toast.success(t('managesessions:sessionSaved'));
        onClose();

    } catch (error) {
        logger.error('[AddEditSessionModal] Error in handleSubmit', { error: error.message, stack: error.stack, response: error.response?.data });
        toast.error(t('managesessions:errorSavingSession') + (error.response?.data?.message ? `: ${error.response.data.message}` : ''));
        setErrors(prev => ({ ...prev, submit: error.message || t('managesessions:errorSavingSession') }));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDateChange = useCallback((date, field) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: date };
      if (field === 'start' && date && prev.end && date > prev.end) {
        newData.end = new Date(date.getTime() + 60 * 60 * 1000); // Auto-adjust end time if start is after end
      }
      if (field === 'earlyBirdDeadline' && date && prev.start && date >= prev.start) {
        // This validation is better handled in validateForm or validateField
      }
      return newData;
    });
    validateField(field, date);
  }, []);

  const renderSessionTypeFields = ({ sectionToRender = 'basic' } = {}) => {
    if (!formData.type) return null;
    const commonProps = {
      formData,
      handleInputChange,
      errors,
      t,
      sessionTypeData: typeSpecificFields[formData.type],
      currencySymbols,
      handleDateChange,
      coachSettings,
      priceRelatedData: {
        isLoading: isLoadingPrice,
        data: priceBreakdownData,
      },
      handleRemoveCourseMaterial,
    };
  
    switch (formData.type) {
      case '66ec4ea477bec414bf2b8859':
        return sectionToRender === 'basic' ? <OneOnOneSessionForm {...commonProps} /> : null;
      case '66ec54f44a8965b22af33fd5':
        return sectionToRender === 'basic' ? <GroupSessionForm {...commonProps} /> : null;
      case '66ec54fe4a8965b22af33fdd':
        return sectionToRender === 'basic' ? <WorkshopSessionForm {...commonProps} /> : null;
      case '66ec54f94a8965b22af33fd9':
        return (
          <WebinarSessionForm
            {...commonProps}
            handleAddWebinarSlot={handleAddWebinarSlot}
            handleRemoveWebinarSlot={handleRemoveWebinarSlot}
            handleWebinarSlotChange={handleWebinarSlotChange}
            renderSection={sectionToRender}
          />
        );
      default:
        return null;
    }
  };

  const handleConflictResolution = async (keptBookingData, removedBookings) => {
    setIsSubmitting(true);
    logger.info('[AddEditSessionModal] Resolving conflicts V2', { keptBookingId: keptBookingData._id, removedCount: removedBookings.length });
    try {
      // The `onSave` prop (which is ManageSessions.handleSaveSession) will be called with the `keptBookingData`.
      // It needs to handle the "save" of the kept booking (which might just be an update if its data changed through conflict resolution UI)
      // AND then the deletion of `removedBookings`.
      // This is complex if `onSave` expects only one primary action.
      // A simpler model is: conflict resolution DELETES old ones, then calls onSave for the "new/kept" one.
      
      for (const booking of removedBookings) {
        if (booking._id) {
          logger.info('[AddEditSessionModal] Deleting conflicting session via onDelete prop', { bookingId: booking._id });
          await onDelete({ _id: booking._id }); // Use the onDelete prop for deletions
        }
      }

      // Now, "save" the `keptBookingData`.
      // We need to reconstruct the file arguments for the parent onSave.
      // This assumes keptBookingData is similar to formData.
      const newTitlePicFile = keptBookingData.titlePicture instanceof File ? keptBookingData.titlePicture : null;
      const newCourseMaterialFiles = (keptBookingData.courseMaterials || []).filter(m => m instanceof File);
      const existingTitlePicMeta = (keptBookingData.titlePicture && !(keptBookingData.titlePicture instanceof File)) ? keptBookingData.titlePicture : null;
      const existingCourseMaterialsMetaInForm = (keptBookingData.courseMaterials || []).filter(m => !(m instanceof File));
      
      // The `sessionData` here for originalCourseMaterials would be tricky.
      // For simplicity, if conflict resolution only allows keeping the *newly submitted* data,
      // then originalCourseMaterials can be empty.
      // If it allows keeping an *existing, modified* session, this gets more complex.
      // Assuming `keptBookingData` is the one to save "as is" after deletions.
      
      // Prepare the payload for the main booking data (without File objects)
      const bookingPayloadToSave = { ...keptBookingData };
      delete bookingPayloadToSave.titlePicture;
      delete bookingPayloadToSave.courseMaterials;
      
      await onSave(
          bookingPayloadToSave, 
          newTitlePicFile, 
          newCourseMaterialFiles,
          existingTitlePicMeta,
          existingCourseMaterialsMetaInForm,
          [] // Assuming original materials of the "kept" booking are not relevant here or handled by parent
      );

      setShowConflictResolution(false);
      toast.success(t('managesessions:conflictResolved'));
      onClose(); 
      // onSave() prop was already called with the kept booking data. Parent refetches.
    } catch (error) {
      logger.error('[AddEditSessionModal] Error resolving conflict V2', { error: error.message });
      toast.error(t('managesessions:errorResolvingConflict'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };


if (!isOpen) return null;

  if (!user?._id) {
    return (
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common:error')}</DialogTitle>
          </DialogHeader>
          <p>{t('common:pleaseLogin')}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t('common:close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (isLoadingConnections || isLoadingTypes) {
    return (
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-xs">
          <div className="flex flex-col items-center justify-center p-6 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">{t('common:loadingData')}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (connectionsError) {
     return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('common:error')}</DialogTitle>
                </DialogHeader>
                <p>{t('managesessions:errorLoadingConnections')}</p>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">{t('common:close')}</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
  }

return (
    <ErrorBoundary>
       <Dialog open={isOpen} onOpenChange={(open) => !open && handleModalClose()}>
        <DialogContent ref={modalRef} className="sm:max-w-3xl max-h-[90vh] flex flex-col bg-background">
          <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
            <DialogTitle className="text-foreground">
              {sessionData ? t('managesessions:editSession') : t('managesessions:addSession')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('managesessions:modalDescription')}
            </DialogDescription>
          </DialogHeader>
          
          <form id="session-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto -mr-6 pr-6 space-y-4 pb-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basicInfo">
                  {t('managesessions:basicInfo')}
                </TabsTrigger>
                {formData.type && (
                  <TabsTrigger value="advancedOptions">
                    {t('managesessions:advancedOptions')}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="basicInfo" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label htmlFor="type">{t('managesessions:sessionType')}</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => handleInputChange({ target: { name: 'type', value } })}
                      name="type"
                    >
                      <SelectTrigger id="type" aria-label={t('managesessions:sessionType')}>
                        <SelectValue placeholder={t('managesessions:selectType')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionTypes && sessionTypes
                          .filter(type => ['66ec4ea477bec414bf2b8859', '66ec54f94a8965b22af33fd9'].includes(type.id))
                          .map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              {getTranslatedSessionTypeName(type.id)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
                  </div>

                  {formData.type === '66ec4ea477bec414bf2b8859' && (
                    <div className="space-y-2">
                      <Label htmlFor="client">{t('managesessions:selectClient')}</Label>
                      <Select
                        value={formData.userId || 'none'}
                        onValueChange={(value) => {
                          const finalValue = value === 'none' ? null : value;
                          handleInputChange({ target: { name: 'userId', value: finalValue } });
                        }}
                        name="userId"
                      >
                        <SelectTrigger id="client" aria-label={t('managesessions:selectClient')}>
                          <SelectValue placeholder={t('managesessions:selectClientOptional')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('managesessions:noClientSelected')}</SelectItem>
                          {connectedClients.length > 0 ? (
                            connectedClients.map(client => (
                              <SelectItem key={client._id} value={client._id}>
                                {`${client.firstName} ${client.lastName}`}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-clients" disabled>
                              {t('managesessions:noConnectedClients')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {errors.userId && <p className="text-sm text-destructive">{errors.userId}</p>}
                    </div>
                  )}
                  {formData.type === '66ec54f44a8965b22af33fd5' && (
                    <div className="space-y-2">
                      <Label htmlFor="clients">{t('managesessions:selectClientsGroup')}</Label>
                      <Select
                        value={formData.userIds.length > 0 ? formData.userIds[0] : ''}
                        onValueChange={(value) => {
                          const newValue = value ? [value] : [];
                          handleInputChange({ target: { name: 'userIds', value: newValue } });
                        }}
                        name="userIds"
                      >
                        <SelectTrigger id="clients" aria-label={t('managesessions:selectClientsGroup')}>
                          <SelectValue placeholder={formData.userIds.length > 0
                            ? `${formData.userIds.length} ${t('managesessions:clientsSelected')}`
                            : t('managesessions:selectClientsOptional')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multi-select-info" disabled>
                            <i>{t('managesessions:multiSelectPlaceholderInfo')}</i>
                          </SelectItem>
                          {connectedClients.map(client => (
                            <SelectItem key={client._id} value={client._id}>
                              {`${client.firstName} ${client.lastName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.userIds && <p className="text-sm text-destructive">{errors.userIds}</p>}
                    </div>
                  )}
                </div>
                {formData.type && (
                  <>
                    {renderSessionTypeFields({ sectionToRender: 'basic' })}
                  </>
                )}
              </TabsContent>

                           {formData.type && (
                <TabsContent value="advancedOptions" className="mt-4">
                  {formData.type === '66ec54f94a8965b22af33fd9' ? (
                    renderSessionTypeFields({ sectionToRender: 'advanced' })
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {formData.type === '66ec4ea477bec414bf2b8859' && (
                        <>
                          <div className="md:col-span-2 space-y-2">
                            <Label htmlFor="description">{t('managesessions:description')}</Label>
                            <Textarea
                              id="description"
                              name="description"
                              value={formData.description}
                              onChange={handleInputChange}
                              rows={3}
                            />
                            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                             <div className="space-y-0.5">
                              <Label htmlFor="isRecurring" className="text-base">
                                {t('managesessions:isRecurring')}
                              </Label>
                            </div>
                            <Switch
                              id="isRecurring"
                              name="isRecurring"
                              checked={formData.isRecurring}
                              onCheckedChange={(checked) => handleInputChange({ target: { name: 'isRecurring', type: 'checkbox', checked } })}
                            />
                          </div>
                          {formData.isRecurring && (
                            <>
                              <div className="space-y-2">
                                <Label htmlFor="recurringPattern">{t('managesessions:recurringPattern')}</Label>
                                <Select
                                  value={formData.recurringPattern}
                                  onValueChange={(value) => handleInputChange({ target: { name: 'recurringPattern', value } })}
                                >
                                  <SelectTrigger id="recurringPattern">
                                    <SelectValue placeholder={t('managesessions:selectPattern', 'Select a pattern')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="daily">{t('managesessions:daily')}</SelectItem>
                                    <SelectItem value="weekly">{t('managesessions:weekly')}</SelectItem>
                                    <SelectItem value="monthly">{t('managesessions:monthly')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="recurringEndDate">{t('managesessions:recurringEndDate')}</Label>
                                 <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !formData.recurringEndDate && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {formData.recurringEndDate ? <>{format(formData.recurringEndDate, "PPP")}</> : <span>Pick a date</span>}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0">
                                    <Calendar
                                      mode="single"
                                      selected={formData.recurringEndDate}
                                      onSelect={(date) => handleDateChange(date, 'recurringEndDate')}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </>
                          )}
                        </>
                      )}
                      {(formData.type === '66ec54f44a8965b22af33fd5' || formData.type === '66ec54fe4a8965b22af33fdd') && (
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="description">{t('managesessions:description')}</Label>
                          <Textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            rows={3}
                          />
                          {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
            {errors.submit && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{errors.submit}</div>}
          </form>

<DialogFooter className="pt-4">
    <Button type="button" variant="outline" onClick={handleModalClose} disabled={isSubmitting}>
        {t('common:cancel')}
    </Button>
    {sessionData ? (
      <Button
          type="button"
          variant="ghost"
          onClick={() => onDelete(sessionData)}
          disabled={isSubmitting}
      >
        <Trash2 size={16} className="mr-2" />
        {t('common:delete')}
      </Button>
    ) : null}
    <Button
      type="submit"
      form="session-form"
      disabled={isSubmitting || Object.keys(errors).length > 0}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('common:saving')}
        </>
      ) : (
        <>
          <Save size={16} className="mr-2" />
          {sessionData ? t('common:update') : t('common:add')}
        </>
      )}
    </Button>
</DialogFooter>
        </DialogContent>
      </Dialog>
      {showConflictResolution && (
        <IntegratedConflictResolution
          isOpen={showConflictResolution}
          conflicts={conflictingBookings}
          newBooking={formData}
          onResolve={handleConflictResolution}
          onClose={() => setShowConflictResolution(false)}
          coachId={coachId}
          sessionTypes={sessionTypes}
          getTranslatedSessionTypeName={getTranslatedSessionTypeName}
        />
      )}
    </ErrorBoundary>
  );
}

AddEditSessionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  sessionData: PropTypes.object,
  coachId: PropTypes.string,
  existingSessions: PropTypes.array,
  coachSettings: PropTypes.object,
};