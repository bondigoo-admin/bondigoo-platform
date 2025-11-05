import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { getCoachSettings, updateCoachSettings } from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import { 
  Briefcase, Banknote, Calendar, Users, 
  TrendingUp, BarChart2, Clock, Star, Sliders, Lock, X,  Trash2, PlusCircle, Info, Sliders as SlidersIcon, ChevronDown, ChevronUp,
  Loader2, CheckCircle, AlertCircle, Shield
} from 'lucide-react';
import { logger } from '../utils/logger';
import { Switch } from './ui/switch.tsx'; 
import { debounce } from 'lodash';

import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import TaxInformationForm from './settings/TaxInformationForm';
import InsuranceRecognitionSettings from './settings/InsuranceRecognitionSettings';

const defaultSettings = {
  professionalProfile: {
    specialties: [],
    expertise: [],
    hourlyRate: 0,
    currency: 'USD',
    showTestimonials: true,
    showReviews: true,
  },
  availabilityManagement: {
    workingHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '', end: '' },
      sunday: { start: '', end: '' },
    },
    vacationMode: false,
    vacationStart: '',
    vacationEnd: '',
    bufferTime: 15,
  },
  sessionManagement: {
    sessionTypes: [],
    maxSessionsPerDay: 5,
    maxSessionsPerWeek: 25,
    overtime: {
      allowOvertime: false,
      freeOvertimeDuration: 0,
      paidOvertimeDuration: 0,
      overtimeRate: 0,
    },
    durationRules: {
      minDuration: 30,
      maxDuration: 120,
      defaultDuration: 60,
      durationStep: 15,
      allowCustomDuration: true,
    },
  },
  clientManagement: {
    clientCapacity: 20,
    waitingListEnabled: false,
    waitingListCapacity: 10,
  },
  paymentAndBilling: {
    paymentMethods: [],
    automaticInvoicing: true,
    invoiceDueDate: 7,
  },
  marketingAndGrowth: {
    featuredCoach: false,
    referralProgramEnabled: false,
    referralReward: 10,
  },
  analyticsDashboard: {
    displayMetrics: ['sessionsCompleted', 'averageRating', 'revenue'],
    customReports: [],
  },
 privacySettings: {
    calendarVisibility: 'connectedOnly',
    showFullCalendar: true,
    bookingPrivacy: 'connectedOnly',
    requireApprovalNonConnected: false,
     profilePrivacy: {
      ratings: true,
      pricing: 'everyone',
    },
    sessionTypeVisibility: {},
    availabilityNotifications: 'all',
    notificationGroups: [],
  },
  notificationPreferences: {
    email: true,
    sms: false,
    inApp: true,
  },
  firmBookingThreshold: 24,
  cancellationPolicy: {
    oneOnOne: {
      tiers: [
        { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.oneOnOne.tier.full_refund_gt_24h" }
      ],
      minimumNoticeHoursClientCancellation: 24, // Client cannot self-cancel if < 24h remaining
      additionalNotes: "",
      rescheduling: {
        allowClientInitiatedRescheduleHoursBefore: 24,
        clientRescheduleApprovalMode: 'coach_approval_if_late',
      }
    },
    webinar: {
      tiers: [
        { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.webinar.tier.full_refund_gt_24h" }
      ],
      minimumNoticeHoursClientCancellation: 24, // Client cannot self-cancel if < 24h remaining
      additionalNotes: ""
    },
    lastUpdated: null
  },
  bufferTimeBetweenSessions: 15,
  maxAdvanceBookingDays: 30,
  minNoticeForBooking: 24,
  timeZone: 'UTC',
};

const CoachSettings = () => {
  const { t } = useTranslation(['common', 'coachSettings', 'settings']);
  const { user, isAuthenticated, coachId } = useContext(AuthContext);
  const [settings, setSettings] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, unsaved, saving, saved, error
  const [activePolicyPreset, setActivePolicyPreset] = useState('custom');
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const policyPresets = {
    flexible: {
      oneOnOne: { tiers: [{ hoursBefore: 24, refundPercentage: 100 }], minimumNoticeHoursClientCancellation: 24, rescheduling: { allowClientInitiatedRescheduleHoursBefore: 24 } },
      webinar: { tiers: [{ hoursBefore: 24, refundPercentage: 100 }], minimumNoticeHoursClientCancellation: 24 },
    },
    moderate: {
      oneOnOne: { tiers: [{ hoursBefore: 72, refundPercentage: 100 }, { hoursBefore: 24, refundPercentage: 50 }], minimumNoticeHoursClientCancellation: 24, rescheduling: { allowClientInitiatedRescheduleHoursBefore: 48 } },
      webinar: { tiers: [{ hoursBefore: 72, refundPercentage: 100 }, { hoursBefore: 24, refundPercentage: 50 }], minimumNoticeHoursClientCancellation: 24 },
    },
    strict: {
      oneOnOne: { tiers: [{ hoursBefore: 168, refundPercentage: 100 }, { hoursBefore: 72, refundPercentage: 50 }], minimumNoticeHoursClientCancellation: 72, rescheduling: { allowClientInitiatedRescheduleHoursBefore: 72 } },
      webinar: { tiers: [{ hoursBefore: 168, refundPercentage: 100 }, { hoursBefore: 72, refundPercentage: 50 }], minimumNoticeHoursClientCancellation: 72 },
    },
  };

  useEffect(() => {
    if (settings.cancellationPolicy?.policyPreset) {
      setActivePolicyPreset(settings.cancellationPolicy.policyPreset);
    }
  }, [settings.cancellationPolicy?.policyPreset]);

 const handlePresetChange = (preset) => {
    if (!preset || preset === 'custom') return;
    const presetData = policyPresets[preset];
    if (!presetData) return;
    setIsDirty(true);

    setSettings(prev => ({
      ...prev,
      cancellationPolicy: {
        ...prev.cancellationPolicy,
        policyPreset: preset,
        oneOnOne: { ...prev.cancellationPolicy.oneOnOne, ...presetData.oneOnOne },
        webinar: { ...prev.cancellationPolicy.webinar, ...presetData.webinar },
      }
    }));
    setActivePolicyPreset(preset);
  };

const generatePolicySummary = (policyType) => {
    const policy = settings.cancellationPolicy[policyType];
    if (!policy || !policy.tiers || policy.tiers.length === 0) return t('coachSettings:noPolicySet');
    
    const sortedTiers = [...policy.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
    
    const summaryLines = sortedTiers.map(tier => 
      t('coachSettings:policySummaryLine', { refundPercentage: tier.refundPercentage, hoursBefore: tier.hoursBefore })
    );

    const lowestHourTier = sortedTiers[sortedTiers.length - 1];
    if (lowestHourTier && lowestHourTier.refundPercentage > 0) {
      summaryLines.push(t('coachSettings:policySummaryNoRefund', { hoursBefore: lowestHourTier.hoursBefore }));
    }
    
    return summaryLines.join(' ');
  };

 const debouncedSave = useCallback(
    debounce(async (currentSettings) => {
      const userId = user?.id;
      if (!userId) {
        logger.error('[CoachSettings] User ID not available for auto-saving settings');
        return;
      }
      setSaveStatus('saving');

      const overtimeErrors = validateOvertimeSettings(currentSettings.sessionManagement.overtime);
      if (overtimeErrors.length > 0) {
        overtimeErrors.forEach(error => toast.error(error));
        setSaveStatus('error');
        return;
      }

      try {
        const updatedSettings = {
          ...currentSettings,
          sessionManagement: {
            ...currentSettings.sessionManagement,
            overtime: {
              allowOvertime: currentSettings.sessionManagement.overtime.allowOvertime ?? false,
              freeOvertimeDuration: Number(currentSettings.sessionManagement.overtime.freeOvertimeDuration ?? 0),
              paidOvertimeDuration: Number(currentSettings.sessionManagement.overtime.paidOvertimeDuration ?? 0),
              overtimeRate: Number(currentSettings.sessionManagement.overtime.overtimeRate ?? 0),
            },
            durationRules: {
              ...currentSettings.sessionManagement.durationRules,
              minDuration: Number(currentSettings.sessionManagement.durationRules.minDuration ?? 30),
              maxDuration: Number(currentSettings.sessionManagement.durationRules.maxDuration ?? 120),
              defaultDuration: Number(currentSettings.sessionManagement.durationRules.defaultDuration ?? 60),
              durationStep: Number(currentSettings.sessionManagement.durationRules.durationStep ?? 15),
            },
          },
          cancellationPolicy: {
            ...currentSettings.cancellationPolicy,
            policyPreset: activePolicyPreset,
            lastUpdated: new Date().toISOString(),
            oneOnOne: {
                ...currentSettings.cancellationPolicy.oneOnOne,
                tiers: currentSettings.cancellationPolicy.oneOnOne.tiers.map(t => ({hoursBefore: Number(t.hoursBefore), refundPercentage: Number(t.refundPercentage)})),
                minimumNoticeHoursClientCancellation: Number(currentSettings.cancellationPolicy.oneOnOne.minimumNoticeHoursClientCancellation),
                rescheduling: {
                    ...currentSettings.cancellationPolicy.oneOnOne.rescheduling,
                    allowClientInitiatedRescheduleHoursBefore: Number(currentSettings.cancellationPolicy.oneOnOne.rescheduling.allowClientInitiatedRescheduleHoursBefore)
                }
            },
            webinar: {
                ...currentSettings.cancellationPolicy.webinar,
                tiers: currentSettings.cancellationPolicy.webinar.tiers.map(t => ({hoursBefore: Number(t.hoursBefore), refundPercentage: Number(t.refundPercentage)})),
                minimumNoticeHoursClientCancellation: Number(currentSettings.cancellationPolicy.webinar.minimumNoticeHoursClientCancellation)
            }
          }
        };

        const latestSettings = await getCoachSettings(userId);
        const settingsToSave = {
            ...updatedSettings,
            privacySettings: latestSettings.privacySettings,
        };

        await updateCoachSettings(userId, settingsToSave);
        logger.info('[CoachSettings] Auto-saved settings successfully for userId:', { userId });
        setSaveStatus('saved');
        setIsDirty(false);
        
        setSettings(settingsToSave);

      } catch (error) {
        logger.error('[CoachSettings] Error auto-saving settings:', { error: error.message, stack: error.stack });
        toast.error(t('coachSettings:errorSavingSettings'));
        setSaveStatus('error');
      }
    }, 2000),
    [user?.id, t, activePolicyPreset]
  );

useEffect(() => {
    if (isDirty && !isLoading) {
      setSaveStatus('unsaved');
      debouncedSave(settings);
    }
    return () => {
      debouncedSave.cancel();
    };
  }, [isDirty, settings, isLoading, debouncedSave]);

useEffect(() => {
    if (saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'error') {
      setIndicatorVisible(true);
    }

    if (saveStatus === 'saved' || saveStatus === 'error') {
        const visibilityTimer = setTimeout(() => {
            setIndicatorVisible(false);
        }, 2800); // Hide just before resetting status

        const statusTimer = setTimeout(() => {
            setSaveStatus('idle');
        }, 3000); // Reset status after hiding

        return () => {
          clearTimeout(visibilityTimer);
          clearTimeout(statusTimer);
        }
    }
}, [saveStatus]);


useEffect(() => {
  const fetchSettings = async () => {
    if (!isAuthenticated || !user?.id) {
      logger.warn('[CoachSettings] Cannot fetch settings: user not authenticated or user ID missing', { isAuthenticated, userId: user?.id });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      logger.info('[CoachSettings] Fetching settings for userId:', { userId: user.id });
      const data = await getCoachSettings(user.id);
      logger.info('[CoachSettings] Received settings:', { settings: data });

      if (data.privacySettings?.profilePrivacy) {
        const oldPricing = data.privacySettings.profilePrivacy.pricing;
        if (typeof oldPricing === 'boolean') {
          data.privacySettings.profilePrivacy.pricing = oldPricing ? 'everyone' : 'private';
          logger.info('[CoachSettings] Migrated legacy boolean pricing privacy setting.');
        }
      }

      const mergedSettings = {
        ...defaultSettings,
        ...data,
        professionalProfile: { ...defaultSettings.professionalProfile, ...data.professionalProfile },
        availabilityManagement: { ...defaultSettings.availabilityManagement, ...data.availabilityManagement },
        sessionManagement: {
          ...defaultSettings.sessionManagement,
          ...data.sessionManagement,
          overtime: { 
            ...defaultSettings.sessionManagement.overtime, 
            ...(data.sessionManagement?.overtime || {}),
            allowOvertime: data.sessionManagement?.overtime?.allowOvertime ?? false,
            freeOvertimeDuration: Number.isFinite(data.sessionManagement?.overtime?.freeOvertimeDuration)
              ? Number(data.sessionManagement.overtime.freeOvertimeDuration)
              : 0,
            paidOvertimeDuration: Number.isFinite(data.sessionManagement?.overtime?.paidOvertimeDuration)
              ? Number(data.sessionManagement.overtime.paidOvertimeDuration)
              : 0,
            overtimeRate: Number.isFinite(data.sessionManagement?.overtime?.overtimeRate)
              ? Number(data.sessionManagement.overtime.overtimeRate)
              : 0,
          },
          durationRules: { ...defaultSettings.sessionManagement.durationRules, ...data.sessionManagement?.durationRules },
        },
        clientManagement: { ...defaultSettings.clientManagement, ...data.clientManagement },
        paymentAndBilling: { ...defaultSettings.paymentAndBilling, ...data.paymentAndBilling },
        marketingAndGrowth: { ...defaultSettings.marketingAndGrowth, ...data.marketingAndGrowth },
        analyticsDashboard: { ...defaultSettings.analyticsDashboard, ...data.analyticsDashboard },
        privacySettings: { ...defaultSettings.privacySettings, ...data.privacySettings },
        notificationPreferences: { ...defaultSettings.notificationPreferences, ...data.notificationPreferences },
        cancellationPolicy: {
          oneOnOne: {
            ...defaultSettings.cancellationPolicy.oneOnOne,
            ...(data.cancellationPolicy?.oneOnOne || {}),
            tiers: data.cancellationPolicy?.oneOnOne?.tiers && data.cancellationPolicy.oneOnOne.tiers.length > 0
                   ? data.cancellationPolicy.oneOnOne.tiers
                   : defaultSettings.cancellationPolicy.oneOnOne.tiers,
            rescheduling: {
              ...defaultSettings.cancellationPolicy.oneOnOne.rescheduling,
              ...(data.cancellationPolicy?.oneOnOne?.rescheduling || {}),
            },
          },
          webinar: {
            ...defaultSettings.cancellationPolicy.webinar,
            ...(data.cancellationPolicy?.webinar || {}),
            tiers: data.cancellationPolicy?.webinar?.tiers && data.cancellationPolicy.webinar.tiers.length > 0
                   ? data.cancellationPolicy.webinar.tiers
                   : defaultSettings.cancellationPolicy.webinar.tiers,
          },
          lastUpdated: data.cancellationPolicy?.lastUpdated || null,
        },
      };
      setSettings(mergedSettings);
    } catch (err) {
      logger.error('[CoachSettings] Failed to fetch coach settings:', { error: err.message, stack: err.stack });
      setError(err.message || 'Failed to fetch settings');
      toast.error(t('coachSettings:errorFetchingSettings'));
    } finally {
      setIsLoading(false);
    }
  };

  fetchSettings();
}, [isAuthenticated, user?.id, t]);

 const handleInputChange = (section, field, value) => {
    logger.debug('[CoachSettings] Updating setting:', { section, field, value });
    setIsDirty(true);
    if (section) {
      setSettings(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handleInsuranceDataUpdate = (newInsuranceData) => {
    setSettings(prev => ({
      ...prev,
      insuranceRecognition: newInsuranceData
    }));
};

  const handleNestedInputChange = (section, nestedSection, field, value) => {
    logger.debug('[CoachSettings] Updating nested setting:', { section, nestedSection, field, value });
    setIsDirty(true);
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [nestedSection]: {
          ...prev[section][nestedSection],
          [field]: value,
        },
      },
    }));
  };

const handlePolicyInputChange = (policyType, field, value) => {
  setIsDirty(true);
  setSettings(prev => ({
    ...prev,
    cancellationPolicy: {
      ...prev.cancellationPolicy,
      [policyType]: {
        ...prev.cancellationPolicy[policyType],
        [field]: value,
      },
    },
  }));

  setActivePolicyPreset('custom');
};

const handleReschedulingInputChange = (field, value) => {
  setIsDirty(true);
  setSettings(prev => ({
    ...prev,
    cancellationPolicy: {
      ...prev.cancellationPolicy,
      oneOnOne: {
        ...prev.cancellationPolicy.oneOnOne,
        rescheduling: {
          ...prev.cancellationPolicy.oneOnOne.rescheduling,
          [field]: value,
        },
      },
    },
  }));

  setActivePolicyPreset('custom');
};

const handleTierChange = (policyType, index, field, value) => {
  setIsDirty(true);
  const updatedTiers = [...settings.cancellationPolicy[policyType].tiers];
  const numericValue = parseInt(value, 10);
  updatedTiers[index] = { ...updatedTiers[index], [field]: isNaN(numericValue) ? 0 : numericValue };
  updatedTiers.sort((a, b) => b.hoursBefore - a.hoursBefore);
  
  setSettings(prev => ({
    ...prev,
    cancellationPolicy: {
      ...prev.cancellationPolicy,
      [policyType]: {
        ...prev.cancellationPolicy[policyType],
        tiers: updatedTiers,
      },
    },
  }));

  setActivePolicyPreset('custom');
};

const handleAddTier = (policyType) => {
  setIsDirty(true);
  const newTier = { hoursBefore: 0, refundPercentage: 0 };
  
  setSettings(prev => {
    const updatedTiers = [...prev.cancellationPolicy[policyType].tiers, newTier];
    updatedTiers.sort((a, b) => b.hoursBefore - a.hoursBefore);
    return {
      ...prev,
      cancellationPolicy: {
        ...prev.cancellationPolicy,
        [policyType]: {
          ...prev.cancellationPolicy[policyType],
          tiers: updatedTiers,
        },
      },
    };
  });

  setActivePolicyPreset('custom');
};

const handleRemoveTier = (policyType, index) => {
  setIsDirty(true);
  setSettings(prev => {
    let updatedTiers = prev.cancellationPolicy[policyType].tiers.filter((_, i) => i !== index);
    if (updatedTiers.length === 0) {
      updatedTiers.push({ hoursBefore: 24, refundPercentage: 100 });
    }
    return {
      ...prev,
      cancellationPolicy: {
        ...prev.cancellationPolicy,
        [policyType]: {
          ...prev.cancellationPolicy[policyType],
          tiers: updatedTiers,
        },
      },
    };
  });

  setActivePolicyPreset('custom');
};

  const validateOvertimeSettings = (overtime) => {
    const errors = [];
    if (overtime.freeOvertimeDuration < 0) {
      errors.push(t('coachSettings:freeOvertimeNonNegative'));
    }
    if (overtime.paidOvertimeDuration < 0) {
      errors.push(t('coachSettings:paidOvertimeNonNegative'));
    }
    if (overtime.overtimeRate < 0 || overtime.overtimeRate > 500) {
      errors.push(t('coachSettings:overtimeRateRange'));
    }
    return errors;
  };

   const handleSubComponentChange = (newSettingsObject) => {
    setIsDirty(true);
    setSettings(prev => ({ ...prev, ...newSettingsObject }));
  };

  if (isLoading) {
    return <div className="settings-loading">{t('common:loading')}</div>;
  }
  
  if (error) {
    return <div className="settings-error">{error}</div>;
  }
  
  if (!settings) {
    return <div className="settings-unavailable">{t('coachSettings:settingsUnavailable')}</div>;
  }

const SaveStatusIndicator = () => {
    let icon = null;
    let textKey = '';
    let baseStyle = '';

    const currentStatus = (saveStatus === 'idle' && !indicatorVisible) ? 'hidden' : saveStatus;

    switch (currentStatus) {
      case 'saving':
        icon = <Loader2 className="h-4 w-4 animate-spin" />;
        textKey = 'coachSettings:status.saving';
        baseStyle = 'bg-slate-800 text-white';
        break;
      case 'saved':
        icon = <CheckCircle className="h-5 w-5" />;
        textKey = 'coachSettings:status.saved';
        baseStyle = 'bg-green-600 text-white';
        break;
      case 'error':
        icon = <AlertCircle className="h-4 w-4" />;
        textKey = 'coachSettings:status.error';
        baseStyle = 'bg-red-600 text-white';
        break;
      default:
        // Render nothing if idle and not visible
        if (!indicatorVisible) return null;
    }
    
    // Fallback for when indicator is fading out but status is already idle
    if (!textKey) { 
        icon = <CheckCircle className="h-5 w-5" />;
        textKey = 'coachSettings:status.saved';
        baseStyle = 'bg-green-600 text-white';
    }

    const visibilityClass = indicatorVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4';

    return (
      <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-lg transition-all duration-300 ease-out ${baseStyle} ${visibilityClass}`}>
        {icon}
        <span>{t(textKey)}</span>
      </div>
    );
  };

return (
    <TooltipProvider>
         <SaveStatusIndicator />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-12 text-slate-900 dark:text-slate-100">

          <section>
          <h2 className="flex items-center text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
              <Banknote className="mr-3 h-6 w-6" /> {t('coachSettings:taxAndBilling')}
          </h2>
          <div className="bg-card rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
             <TaxInformationForm />
          </div>
      </section>

      <hr className="my-6 border-slate-200 dark:border-slate-700" />     
      
      <section>
          <h2 className="flex items-center text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
              <Shield className="mr-3 h-6 w-6" /> {t('settings:insurance.title')}
          </h2>
          <InsuranceRecognitionSettings 
              coachSettings={settings}
              onSettingsChange={handleSubComponentChange}
              onUpdate={handleInsuranceDataUpdate}
          />
      </section>

      <hr className="my-6 border-slate-200 dark:border-slate-700" />     
           <section>
        <h2 className="flex items-center text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
          <Calendar className="mr-3 h-6 w-6" /> {t('coachSettings:bookingAndSchedulingRules')}
        </h2>

    
       
     

               <div className="bg-card p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">{t('coachSettings:sessionDurationAndOvertime')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('coachSettings:allowOvertimeDescription')}</p>
            </div>
            <Switch
                id="allowOvertime"
                checked={settings.sessionManagement?.overtime?.allowOvertime ?? false}
                onCheckedChange={(checked) => handleNestedInputChange('sessionManagement', 'overtime', 'allowOvertime', checked)}
            />
          </div>

          {settings.sessionManagement.overtime.allowOvertime && (
            <div className="mt-6 space-y-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('coachSettings:overtimeRulesDescription')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
    <div className="space-y-2">
        <Label htmlFor="freeOvertimeDuration" className="flex items-center">
            {t('coachSettings:freeOvertime')}
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild><Info className="ml-2 h-4 w-4 text-slate-500" /></TooltipTrigger>
                <TooltipContent><p>{t('coachSettings:freeOvertimeTooltip')}</p></TooltipContent>
            </Tooltip>
        </Label>
        <div className="flex items-baseline gap-2">
            <Input type="number" id="freeOvertimeDuration" value={settings.sessionManagement?.overtime?.freeOvertimeDuration ?? ''} onChange={(e) => handleNestedInputChange('sessionManagement', 'overtime', 'freeOvertimeDuration', e.target.value === '' ? null : parseInt(e.target.value, 10))} min="0" className="w-28" />
            <span className="text-sm text-slate-500 dark:text-slate-400">{t('common:minutes')}</span>
        </div>
    </div>
    <div className="space-y-2">
        <Label htmlFor="paidOvertimeDuration" className="flex items-center">
            {t('coachSettings:paidOvertime')}
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild><Info className="ml-2 h-4 w-4 text-slate-500" /></TooltipTrigger>
                <TooltipContent><p>{t('coachSettings:paidOvertimeTooltip')}</p></TooltipContent>
            </Tooltip>
        </Label>
        <div className="flex items-baseline gap-2">
            <Input type="number" id="paidOvertimeDuration" value={settings.sessionManagement?.overtime?.paidOvertimeDuration ?? ''} onChange={(e) => handleNestedInputChange('sessionManagement', 'overtime', 'paidOvertimeDuration', e.target.value === '' ? null : parseInt(e.target.value, 10))} min="0" className="w-28" />
            <span className="text-sm text-slate-500 dark:text-slate-400">{t('common:minutes')}</span>
        </div>
    </div>
    <div className="space-y-2">
        <Label htmlFor="overtimeRate" className="flex items-center">
            {t('coachSettings:overtimeRateLabel')}
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild><Info className="ml-2 h-4 w-4 text-slate-500" /></TooltipTrigger>
                <TooltipContent><p>{t('coachSettings:overtimeRateTooltip')}</p></TooltipContent>
            </Tooltip>
        </Label>
        <div className="flex items-baseline gap-2">
            <Input type="number" id="overtimeRate" value={settings.sessionManagement?.overtime?.overtimeRate ?? ''} onChange={(e) => handleNestedInputChange('sessionManagement', 'overtime', 'overtimeRate', e.target.value === '' ? null : parseInt(e.target.value, 10))} min="0" max="500" className="w-28" />
            <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
        </div>
    </div>
</div>
            </div>
          )}
         
        </div>
      </section>

         
      <hr className="my-6 border-slate-200 dark:border-slate-700" />     
         
                 <section>
            <h2 className="flex items-center text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
                <SlidersIcon className="mr-3 h-6 w-6" /> {t('coachSettings:cancellationAndReschedulingPolicies')}
            </h2>
            
            <div className="mb-8">
                <Label className="text-base font-semibold">{t('coachSettings:policyPresetsTitle')}</Label>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('coachSettings:policyPresetsDescription')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {['flexible', 'moderate', 'strict'].map((preset) => (
                        <Button 
                          key={preset} 
                          variant={activePolicyPreset === preset ? 'default' : 'outline'} 
                          onClick={() => handlePresetChange(preset)}
                          className="h-auto text-left flex flex-col items-start p-4"
                        >
                            <span className="font-semibold text-base">{t(`coachSettings:presets.${preset}.title`)}</span>
                            <span className="font-normal text-xs whitespace-normal mt-1">{t(`coachSettings:presets.${preset}.description`)}</span>
                        </Button>
                    ))}
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                <div className="bg-card p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <h3 className="text-xl font-semibold">{t('coachSettings:oneOnOnePolicyTitle')}</h3>
                  
                       <div>
    <div className="grid grid-cols-[1fr,1fr,auto] gap-x-4 mb-2">
        <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('coachSettings:tierHoursHeader')}</Label>
        <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('coachSettings:tierRefundHeader')}</Label>
    </div>
    <div className="space-y-3">
        {settings.cancellationPolicy?.oneOnOne?.tiers?.map((tier, index) => (
            <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-x-4 items-center">
                <div className="flex items-baseline gap-2">
                    <Input type="number" value={tier.hoursBefore} onChange={(e) => handleTierChange('oneOnOne', index, 'hoursBefore', e.target.value)} min="0" className="w-24" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">{t('common:hours')}</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <Input type="number" value={tier.refundPercentage} onChange={(e) => handleTierChange('oneOnOne', index, 'refundPercentage', e.target.value)} min="0" max="100" className="w-24" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                </div>
                <Button onClick={() => handleRemoveTier('oneOnOne', index)} variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50"><Trash2 className="h-4 w-4" /></Button>
            </div>
        ))}
    </div>
    <Button onClick={() => handleAddTier('oneOnOne')} variant="outline" size="sm" className="mt-4"><PlusCircle className="mr-2 h-4 w-4" /> {t('coachSettings:addTier')}</Button>
</div>

                    <hr className="border-slate-200 dark:border-slate-700" />
                    
                    <div className="space-y-6">
                      <h4 className="font-semibold text-slate-700 dark:text-slate-300">{t('coachSettings:reschedulingPolicy')}</h4>
                      <div className="space-y-2">
    <Label htmlFor="allowClientRescheduleHours" className="flex items-center">
        {t('coachSettings:allowClientInitiatedRescheduleHoursBefore')} 
        <Tooltip delayDuration={300}><TooltipTrigger asChild><Info className="ml-2 h-4 w-4 text-slate-500 " /></TooltipTrigger><TooltipContent><p>{t('coachSettings:allowClientRescheduleHoursTooltip')}</p></TooltipContent></Tooltip>
    </Label>
    <div className="flex items-baseline gap-2">
        <Input type="number" id="allowClientRescheduleHours" value={settings.cancellationPolicy?.oneOnOne?.rescheduling?.allowClientInitiatedRescheduleHoursBefore || ''} onChange={(e) => handleReschedulingInputChange('allowClientInitiatedRescheduleHoursBefore', e.target.value)} min="0" className="w-24" />
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('common:hours')}</span>
    </div>
</div>
                      <div className="space-y-2">
                          <Label htmlFor="clientRescheduleApprovalMode" className="flex items-center">
                              {t('coachSettings:clientRescheduleApprovalMode')} 
                              <Tooltip delayDuration={300}><TooltipTrigger asChild><Info className="ml-2 h-4 w-4 text-slate-500 " /></TooltipTrigger><TooltipContent><p>{t('coachSettings:clientRescheduleApprovalModeTooltip')}</p></TooltipContent></Tooltip>
                          </Label>
                          <Select value={settings.cancellationPolicy?.oneOnOne?.rescheduling?.clientRescheduleApprovalMode || 'coach_approval_if_late'} onValueChange={(value) => handleReschedulingInputChange('clientRescheduleApprovalMode', value)}>
                              <SelectTrigger id="clientRescheduleApprovalMode"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="automatic_if_early">{t('coachSettings:approvalModeAutomaticIfEarly')}</SelectItem>
                                  <SelectItem value="coach_approval_if_late">{t('coachSettings:approvalModeCoachApprovalIfLate')}</SelectItem>
                                  <SelectItem value="always_coach_approval">{t('coachSettings:approvalModeAlwaysCoachApproval')}</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>
                    </div>
                </div>

                <div className="bg-card p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <h3 className="text-xl font-semibold">{t('coachSettings:webinarPolicyTitle')}</h3>
<div>
    <div className="grid grid-cols-[1fr,1fr,auto] gap-x-4 mb-2">
        <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('coachSettings:tierHoursHeader')}</Label>
        <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('coachSettings:tierRefundHeader')}</Label>
    </div>
    <div className="space-y-3">
      {settings.cancellationPolicy?.webinar?.tiers?.map((tier, index) => (
          <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-x-4 items-center">
              <div className="flex items-baseline gap-2">
                  <Input type="number" value={tier.hoursBefore} onChange={(e) => handleTierChange('webinar', index, 'hoursBefore', e.target.value)} min="0" className="w-24" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t('common:hours')}</span>
              </div>
              <div className="flex items-baseline gap-2">
                  <Input type="number" value={tier.refundPercentage} onChange={(e) => handleTierChange('webinar', index, 'refundPercentage', e.target.value)} min="0" max="100" className="w-24" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
              </div>
              <Button onClick={() => handleRemoveTier('webinar', index)} variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50"><Trash2 className="h-4 w-4" /></Button>
          </div>
      ))}
    </div>
    <Button onClick={() => handleAddTier('webinar')} variant="outline" size="sm" className="mt-4"><PlusCircle className="mr-2 h-4 w-4" /> {t('coachSettings:addTier')}</Button>
</div>
                </div>
            </div>

            <div className="mt-8 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{t('coachSettings:policySummaryTitle')}</h4>
                <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <p><span className="font-semibold">{t('coachSettings:oneOnOne')}:</span> {generatePolicySummary('oneOnOne')}</p>
                    <p><span className="font-semibold">{t('coachSettings:webinar')}:</span> {generatePolicySummary('webinar')}</p>
                </div>
            </div>

         
          </section>        

  
</div>
    </TooltipProvider>
  );
};

export default CoachSettings;