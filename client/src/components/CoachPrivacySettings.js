import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { getCoachSettings, updateCoachSettings } from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import { Lock, Info, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { logger } from '../utils/logger';
import { debounce } from 'lodash';

import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const defaultSettings = {
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
};

const CoachPrivacySettings = () => {
    const { t } = useTranslation(['coachSettings']);
    const { user, isAuthenticated } = useContext(AuthContext);
    const [settings, setSettings] = useState(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isDirty, setIsDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [indicatorVisible, setIndicatorVisible] = useState(false);

    const debouncedSave = useCallback(
        debounce(async (currentSettings) => {
            const userId = user?.id;
            if (!userId) return;
            
            setSaveStatus('saving');
            try {
                const latestSettings = await getCoachSettings(userId);
                const settingsToSave = {
                    ...latestSettings,
                    privacySettings: currentSettings.privacySettings,
                };
                await updateCoachSettings(userId, settingsToSave);
                logger.info('[CoachPrivacySettings] Auto-saved settings successfully.', { userId });
                setSaveStatus('saved');
                setIsDirty(false);
                setSettings(settingsToSave);
            } catch (error) {
                logger.error('[CoachPrivacySettings] Error auto-saving settings:', { error: error.message, stack: error.stack });
                toast.error(t('errorSavingSettings'));
                setSaveStatus('error');
            }
        }, 2000),
        [user?.id, t]
    );
    
    useEffect(() => {
        if (isDirty && !isLoading) {
            setSaveStatus('unsaved');
            debouncedSave(settings);
        }
        return () => debouncedSave.cancel();
    }, [isDirty, settings, isLoading, debouncedSave]);
    
    useEffect(() => {
        if (saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'error') {
          setIndicatorVisible(true);
        }
        if (saveStatus === 'saved' || saveStatus === 'error') {
            const timer = setTimeout(() => setIndicatorVisible(false), 2800);
            const statusTimer = setTimeout(() => setSaveStatus('idle'), 3000);
            return () => { clearTimeout(timer); clearTimeout(statusTimer); }
        }
    }, [saveStatus]);

    useEffect(() => {
        const fetchSettings = async () => {
            if (!isAuthenticated || !user?.id) {
                setIsLoading(false);
                return;
            }
            try {
                setIsLoading(true);
                const data = await getCoachSettings(user.id);
                const mergedSettings = { ...defaultSettings, ...data };
                setSettings(mergedSettings);
            } catch (err) {
                logger.error('[CoachPrivacySettings] Failed to fetch settings:', { error: err.message });
                toast.error(t('errorFetchingSettings'));
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [isAuthenticated, user?.id, t]);

    const handleInputChange = (section, field, value) => {
        setIsDirty(true);
        setSettings(prev => ({
            ...prev,
            [section]: { ...prev[section], [field]: value },
        }));
    };

    const handleProfilePrivacyChange = (field, value) => {
        setIsDirty(true);
        setSettings(prev => ({
            ...prev,
            privacySettings: {
                ...prev.privacySettings,
                profilePrivacy: {
                    ...(prev.privacySettings?.profilePrivacy || {}),
                    [field]: value,
                },
            },
        }));
    };
    
    const getAccessLevel = () => {
        const { calendarVisibility, bookingPrivacy } = settings.privacySettings;
        if (calendarVisibility === 'public' && bookingPrivacy === 'public') return 'public';
        if (calendarVisibility === 'connectedOnly' && bookingPrivacy === 'connectedOnly') return 'connected';
        if (calendarVisibility === 'private' && bookingPrivacy === 'private') return 'private';
        return 'public';
    };

    const handleAccessLevelChange = (level) => {
        setIsDirty(true);
        let newPrivacySettings = { ...settings.privacySettings };
        const mappings = {
            public: { calendarVisibility: 'public', bookingPrivacy: 'public' },
            connected: { calendarVisibility: 'connectedOnly', bookingPrivacy: 'connectedOnly' },
            private: { calendarVisibility: 'private', bookingPrivacy: 'private' },
        };
        newPrivacySettings = { ...newPrivacySettings, ...mappings[level], requireApprovalNonConnected: false };
        setSettings(prev => ({ ...prev, privacySettings: newPrivacySettings }));
    };

    const SaveStatusIndicator = () => { /* ... identical to the one in CoachSettings.js ... */ };

    if (isLoading) return <div>{t('common:loading')}</div>;

    return (
        <TooltipProvider>
            <section>
                <h2 className="flex items-center text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
                    <Lock className="mr-3 h-6 w-6" /> {t('privacyAndVisibility')}
                </h2>
                <div className="space-y-8">
                    <div className="bg-card p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-xl font-semibold">{t('bookingAndCalendarAccess')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">{t('bookingAndCalendarAccessDescription')}</p>
                        <div className="space-y-4" role="radiogroup">
                             <div className={`p-4 border rounded-lg transition-all ${getAccessLevel() === 'public' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
                                <label className="flex items-start cursor-pointer">
                                    <input type="radio" name="accessLevel" value="public" checked={getAccessLevel() === 'public'} onChange={() => handleAccessLevelChange('public')} className="mr-3 mt-1 h-4 w-4 accent-primary focus:ring-0 focus:ring-offset-0" />
                                    <div className="flex-1">
                                        <span className="font-semibold">{t('accessLevelPublic')}</span>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('accessLevelPublicDescription')}</p>
                                    </div>
                                </label>
                                {getAccessLevel() === 'public' && (
                                    <div className="mt-4 pl-7 space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                                        <h4 className="text-sm font-semibold">{t('publicCalendarDisplay')}</h4>
                                        <div role="radiogroup">
                                            <label className="flex items-center text-sm cursor-pointer mb-2">
                                                <input type="radio" name="showFullCalendar" value="false" checked={!settings.privacySettings.showFullCalendar} onChange={() => handleInputChange('privacySettings', 'showFullCalendar', false)} className="mr-2 h-4 w-4 accent-primary focus:ring-0 focus:ring-offset-0"/>
                                                {t('showBusyAvailable')}
                                                <Tooltip delayDuration={300}>
                                                    <TooltipTrigger asChild><Info className="ml-1 h-4 w-4 text-slate-500 " /></TooltipTrigger>
                                                    <TooltipContent><p>{t('showBusyAvailableTooltip')}</p></TooltipContent>
                                                </Tooltip>
                                            </label>
                                            <label className="flex items-center text-sm cursor-pointer">
                                                <input type="radio" name="showFullCalendar" value="true" checked={settings.privacySettings.showFullCalendar} onChange={() => handleInputChange('privacySettings', 'showFullCalendar', true)} className="mr-2 h-4 w-4 accent-primary focus:ring-0 focus:ring-offset-0"/>
                                                {t('showFullCalendarDetails')}
                                                <Tooltip delayDuration={300}>
                                                    <TooltipTrigger asChild><Info className="ml-1 h-4 w-4 text-slate-500 " /></TooltipTrigger>
                                                    <TooltipContent><p>{t('showFullCalendarDetailsTooltip')}</p></TooltipContent>
                                                </Tooltip>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className={`p-4 border rounded-lg transition-all ${getAccessLevel() === 'connected' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
                                <label className="flex items-start cursor-pointer">
                                    <input type="radio" name="accessLevel" value="connected" checked={getAccessLevel() === 'connected'} onChange={() => handleAccessLevelChange('connected')} className="mr-3 mt-1 h-4 w-4 accent-primary focus:ring-0 focus:ring-offset-0" />
                                    <div className="flex-1">
                                        <span className="font-semibold">{t('accessLevelConnected')}</span>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('accessLevelConnectedDescription')}</p>
                                    </div>
                                </label>
                            </div>
                            <div className={`p-4 border rounded-lg transition-all ${getAccessLevel() === 'private' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700'}`}>
                                <label className="flex items-start cursor-pointer">
                                    <input type="radio" name="accessLevel" value="private" checked={getAccessLevel() === 'private'} onChange={() => handleAccessLevelChange('private')} className="mr-3 mt-1 h-4 w-4 accent-primary focus:ring-0 focus:ring-offset-0" />
                                    <div className="flex-1">
                                        <span className="font-semibold">{t('accessLevelPrivate')}</span>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('accessLevelPrivateDescription')}</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-xl font-semibold">{t('profileContentVisibility')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('profileContentVisibilityDesc')}</p>
                        <div className="mt-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-4">
                                <Label htmlFor="pricingVisibility" className="md:col-span-1 flex flex-col space-y-1">
                                    <span className="font-medium">{t('showPricingTitle')}</span>
                                    <span className="font-normal text-sm text-slate-500 dark:text-slate-400">{t('showPricingDescV2')}</span>
                                </Label>
                                <div className="md:col-span-2">
                                    <Select value={settings.privacySettings?.profilePrivacy?.pricing || 'everyone'} onValueChange={(value) => handleProfilePrivacyChange('pricing', value)}>
                                        <SelectTrigger id="pricingVisibility" className="w-full">
                                            <SelectValue placeholder={t('selectVisibility')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="everyone">{t('pricingVisibility.everyone')}</SelectItem>
                                            <SelectItem value="registered_users">{t('pricingVisibility.registered_users')}</SelectItem>
                                            <SelectItem value="connected_users">{t('pricingVisibility.connected_users')}</SelectItem>
                                            <SelectItem value="private">{t('pricingVisibility.private')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </TooltipProvider>
    );
};

export default CoachPrivacySettings;