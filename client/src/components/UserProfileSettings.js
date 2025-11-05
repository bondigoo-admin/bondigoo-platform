import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { updateUserDetails, changePassword, requestEmailChange } from '../services/userAPI';
import { toast } from 'react-hot-toast';
import { User, Lock, Mail, CreditCard, Bell, Eye, Home, Info, Briefcase, MapPin, UserCheck, Globe, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import usePlacesAutocomplete, { getGeocode, getDetails } from 'use-places-autocomplete';
import SavedPaymentMethodsManager from './payment/SavedPaymentMethodsManager';
import PhoneInput from 'react-phone-number-input';
import { Country } from 'country-state-city';
import { requestAccountDeletion } from '../services/userAPI';
import { debounce } from 'lodash';

import { Input } from './ui/input.tsx'; 
import { Button } from './ui/button.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Switch } from './ui/switch.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter } from './ui/alert-dialog.tsx';

import 'react-phone-number-input/style.css'; // This can be moved to a global import later
// Note: We no longer need a separate CSS file like UserProfileSettings.css if all styling is Tailwind

const BLOCKED_COUNTRIES = [
    'GB', // United Kingdom: £0 threshold
    'NO', // Norway: 0 NOK threshold
    'IS', // Iceland: 0 ISK threshold
    'IN', // India: 0 INR threshold
    'ZA', // South Africa: 0 ZAR threshold
    'NZ', // New Zealand: 0 NZD threshold
];

const getChangedFields = (initial, current) => {
    const changes = {};
    if (!initial) return current;

    Object.keys(current).forEach(key => {
        const initialValue = initial[key];
        const currentValue = current[key];
        const isObject = val => val && typeof val === 'object';

        if (isObject(currentValue) && isObject(initialValue)) {
            if (JSON.stringify(currentValue) !== JSON.stringify(initialValue)) {
                changes[key] = currentValue;
            }
        } else if (initialValue !== currentValue) {
            changes[key] = currentValue;
        }
    });
    return changes;
};

const AddressAutocompleteInput = ({ initialValue, onAddressSelect, disabled, label }) => {
    const { ready, value, suggestions: { status, data }, setValue, clearSuggestions } = usePlacesAutocomplete({
        requestOptions: {},
        debounce: 300,
    });

    useEffect(() => {
        setValue(initialValue, false);
    }, [initialValue, setValue]);

    const handleInput = (e) => {
        setValue(e.target.value);
    };

    const handleSelect = ({ description }) => async () => {
        setValue(description, false);
        clearSuggestions();
        try {
            const results = await getGeocode({ address: description });
            const placeId = results[0].place_id;
            const details = await getDetails({ placeId, fields: ["address_components", "formatted_address"] });
            
            const parseComponent = (type) => details.address_components.find(c => c.types.includes(type))?.long_name || '';
            const parseComponentShort = (type) => details.address_components.find(c => c.types.includes(type))?.short_name || '';
            
            const street_number = parseComponent('street_number');
            const route = parseComponent('route');

            onAddressSelect({
                street: `${street_number} ${route}`.trim(),
                city: parseComponent('locality') || parseComponent('postal_town'),
                state: parseComponentShort('administrative_area_level_1'),
                postalCode: parseComponent('postal_code'),
                country: parseComponentShort('country'),
                fullAddress: details.formatted_address,
            });
        } catch (error) {
            console.error("Error fetching address details: ", error);
        }
    };

    const renderSuggestions = () => (
        <ul className="absolute z-50 mt-1 w-full list-none rounded-md border border-slate-200 bg-card p-0 shadow-lg dark:border-slate-700">
            {data.map((suggestion) => {
                const { place_id, structured_formatting: { main_text, secondary_text } } = suggestion;
                return (
                    <li key={place_id} onClick={handleSelect(suggestion)} className="cursor-pointer px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <strong className="text-sm font-medium">{main_text}</strong> <small className="ml-1 text-xs text-muted-foreground">{secondary_text}</small>
                    </li>
                );
            })}
             <li className="flex justify-end p-2 bg-card">
                <img src="https://developers.google.com/maps/documentation/images/powered_by_google_on_white.png" alt="Powered by Google" className="h-4 dark:hidden" />
                <img src="https://developers.google.com/maps/documentation/images/powered_by_google_on_non_white.png" alt="Powered by Google" className="h-4 hidden dark:block" />
            </li>
        </ul>
    );

    return (
        <div className="relative">
             <Input 
                id="fullAddress"
                label={label}
                value={value}
                onChange={handleInput}
                disabled={!ready || disabled}
                autoComplete="off"
            />
            {status === 'OK' && renderSuggestions()}
        </div>
    );
};

const UserProfileSettings = ({ profile, onProfileUpdate }) => {
    const { t } = useTranslation(['common', 'userprofile']);
    const { user, logout, updateUserContext } = useContext(AuthContext);
    const initialProfileRef = useRef(null);
    const isInitialized = useRef(false);

    console.log(`[UserProfileSettings] Component Render. Is Initialized: ${isInitialized.current}`);

const [timeZoneOptions, setTimeZoneOptions] = useState([]);

    const languageOptions = [
        { value: 'de', label: t('common:languages.de', 'Deutsch') },
        { value: 'en', label: t('common:languages.en', 'English') },
        { value: 'fr', label: t('common:languages.fr', 'Français') },
    ];
    const currencyOptions = [
        { value: 'EUR', label: t('common:currencies.EUR', 'EUR - Euro') },
        { value: 'CHF', label: t('common:currencies.CHF', 'CHF - Swiss Franc') },
        { value: 'USD', label: t('common:currencies.USD', 'USD - US Dollar') },
    ];
    const dateFormatOptions = [
        { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (z.B. 31.12.2023)' },
        { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (z.B. 12/31/2023)' },
        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (z.B. 2023-12-31)' },
    ];
    const timeFormatOptions = [
        { value: '24h', label: '24-Stunden (z.B. 16:30)' },
        { value: '12h', label: '12-Stunden (z.B. 4:30 PM)' },
    ];

    useEffect(() => {
    console.log('[UserProfileSettings] DIAGNOSTIC: Component has MOUNTED.');
    return () => {
        console.log('[UserProfileSettings] DIAGNOSTIC: Component is UNMOUNTING.');
    }
}, []);

    useEffect(() => {
    setTimeZoneOptions(
        Intl.supportedValuesOf('timeZone').map(tz => ({ value: tz, label: tz }))
    );
}, []);

    const allCountries = Country.getAllCountries().map(c => ({
        value: c.isoCode,
        label: t(`countries.${c.isoCode}`, { ns: 'common', defaultValue: c.name }),
    }))
    .filter(c => !BLOCKED_COUNTRIES.includes(c.value))
    .sort((a, b) => a.label.localeCompare(b.label));

    const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    occupation: '',
    location: '',
    phone: '',
    billingDetails: { name: '', address: { street: '', city: '', postalCode: '', country: '', state: '' }},
    profileVisibility: 'public',
    settings: {
        notificationPreferences: { email: true, inApp: true },
        language: 'de',
        currency: 'EUR',
        timeZone: 'Europe/Berlin',
        dateFormat: 'DD.MM.YYYY',
        timeFormat: '24h'
    },
});
    const [fullAddress, setFullAddress] = useState('');
    const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [indicatorVisible, setIndicatorVisible] = useState(false);
    const [isChangingEmail, setIsChangingEmail] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isSubmittingEmailChange, setIsSubmittingEmailChange] = useState(false);
    const [emailChangeData, setEmailChangeData] = useState({ newEmail: '', currentPassword: '' });

useEffect(() => {
    
    if (!profile || isInitialized.current) {
        if (isInitialized.current) console.log('[UserProfileSettings] Profile Effect: Bailing out, form already initialized.');
        return;
    }
   
    const billingAddress = profile.billingDetails?.address || {};
    const fullAdrString = [billingAddress.street, billingAddress.city, billingAddress.state, billingAddress.postalCode, Country.getCountryByCode(billingAddress.country)?.name].filter(Boolean).join(', ');
    setFullAddress(fullAdrString);
    
    // This is the critical fix: Merge profile data into the default form structure
    // to ensure all fields, including the user 'id', are preserved.
    const initialFormData = {
        ...formData, // Start with component's default state structure
        ...profile,  // Overwrite with all fields from the profile prop
        // Deep merge nested objects to prevent them from being overwritten entirely
        billingDetails: {
            ...formData.billingDetails,
            ...(profile.billingDetails || {}),
            address: {
                ...formData.billingDetails.address,
                ...((profile.billingDetails && profile.billingDetails.address) || {}),
            }
        },
        settings: {
            ...formData.settings,
            ...(profile.settings || {}),
            notificationPreferences: {
                ...formData.settings.notificationPreferences,
                ...((profile.settings && profile.settings.notificationPreferences) || {}),
            }
        }
    };

    setFormData(initialFormData);
    initialProfileRef.current = JSON.parse(JSON.stringify(initialFormData));
    isInitialized.current = true;
    console.log('[UserProfileSettings] Profile Effect: Initialization complete. isInitialized set to true.');
}, [profile]);

const debouncedSave = useCallback(
    debounce(async (currentFormData) => {
        setSaveStatus('saving');
        const changedData = getChangedFields(initialProfileRef.current, currentFormData);

        if (Object.keys(changedData).length === 0) {
            setSaveStatus('saved');
            setIsDirty(false);
            return;
        }

        try {
            const updatedProfile = await updateUserDetails(changedData);
            onProfileUpdate(updatedProfile);
            if (updateUserContext) {
                updateUserContext(updatedProfile);
            }
            initialProfileRef.current = JSON.parse(JSON.stringify(currentFormData));
            setSaveStatus('saved');
            setIsDirty(false);
        } catch (error) {
            console.error('[UserProfileSettings] Autosave error:', error);
            toast.error(t('userprofile:errorSavingProfile'));
            setSaveStatus('error');
        }
    }, 1500),
    [onProfileUpdate, updateUserContext, t]
);

useEffect(() => {
    if (isDirty) {
        debouncedSave(formData);
    }
    return () => {
        debouncedSave.cancel();
    };
}, [isDirty, formData, debouncedSave]);

useEffect(() => {
    if (saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'error') {
      setIndicatorVisible(true);
    }

    if (saveStatus === 'saved' || saveStatus === 'error') {
        const visibilityTimer = setTimeout(() => {
            setIndicatorVisible(false);
        }, 2800);

        const statusTimer = setTimeout(() => {
            setSaveStatus('idle');
        }, 3000);

        return () => {
          clearTimeout(visibilityTimer);
          clearTimeout(statusTimer);
        }
    }
}, [saveStatus]);
    
const handleAddressSelect = (address) => {
    setIsDirty(true);
    setFormData(prev => ({
        ...prev,
        billingDetails: {
            ...prev.billingDetails,
            address: {
                street: address.street,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                country: address.country,
            }
        }
    }));
    setFullAddress(address.fullAddress);
};

const handleInputChange = (e) => {
    setIsDirty(true);
    const { name, value } = e.target;
    const keys = name.split('.');
    if (keys.length > 1) {
        setFormData(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newState;
        });
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
};

// Handler for ShadCN Switch component
const handleSwitchChange = (name, checked) => {
    setIsDirty(true);
     const keys = name.split('.');
     setFormData(prev => {
        const newState = JSON.parse(JSON.stringify(prev));
        let current = newState;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = checked;
        return newState;
    });
};

const handleNestedValueChange = (name, value) => {
    setIsDirty(true);
    const keys = name.split('.');
    setFormData(prev => {
        const newState = JSON.parse(JSON.stringify(prev));
        let current = newState;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        return newState;
    });
};

    const handlePasswordInputChange = (e) => {
        setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmNewPassword) return toast.error(t('userprofile:passwordsDoNotMatch'));
        if (passwordData.newPassword.length < 8) return toast.error(t('userprofile:passwordTooShort'));
        setIsSavingPassword(true);
        try {
            await changePassword({ currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword });
            toast.success(t('userprofile:passwordChangedSuccess'));
            setPasswordData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
        } catch (error) {
            console.error('[UserProfileSettings] Error changing password:', error);
            toast.error(error.response?.data?.message || t('userprofile:errorChangingPassword'));
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleEmailInputChange = (e) => {
        setEmailChangeData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleRequestEmailChange = async (e) => {
        e.preventDefault();
        if (!emailChangeData.newEmail || !emailChangeData.currentPassword) {
            return toast.error(t('userprofile:errorEmailPasswordRequired'));
        }
        setIsSubmittingEmailChange(true);
        try {
            const response = await requestEmailChange(emailChangeData);
            toast.success(response.message || t('userprofile:emailVerificationSent', { email: emailChangeData.newEmail }));
            setIsChangingEmail(false);
            setEmailChangeData({ newEmail: '', currentPassword: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || t('userprofile:errorChangingEmail'));
        } finally {
            setIsSubmittingEmailChange(false);
        }
    };

    const handleSelectChange = (name, value) => {
    const keys = name.split('.');
    setFormData(prev => {
        const newState = JSON.parse(JSON.stringify(prev));
        let current = newState;
        for (let i = 0; i < keys.length - 1; i++) {
            // Ensure parent objects exist
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        return newState;
    });
};

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
    <div className="container mx-auto max-w-4xl py-8 px-4 sm:px-6 lg:px-8 space-y-8">
       <SaveStatusIndicator /> 
       <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('userprofile:accountSettings')}</h1>
            
        </div>
        
        <form onSubmit={(e) => e.preventDefault()} className="space-y-8">

               <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><User />{t('userprofile:profileInformation')}</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Select name="salutation" value={formData.salutation || ''} onValueChange={(value) => handleNestedValueChange('salutation', value)}>
                                <SelectTrigger label={t('common:salutation')}>
                                    <SelectValue placeholder=" " />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mr">{t('common:salutations.mr')}</SelectItem>
                                    <SelectItem value="mrs">{t('common:salutations.mrs')}</SelectItem>
                                    <SelectItem value="dr">{t('common:salutations.dr')}</SelectItem>
                                    <SelectItem value="prof">{t('common:salutations.prof')}</SelectItem>
                                    <SelectItem value="mx">{t('common:salutations.mx')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input id="firstName" name="firstName" type="text" value={formData.firstName} onChange={handleInputChange} label={t('common:firstName')}  icon={User}/>
                            <Input id="lastName" name="lastName" type="text" value={formData.lastName} onChange={handleInputChange} label={t('common:lastName')}  icon={User}/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input id="location" name="location" type="text" value={formData.location} onChange={handleInputChange} label={t('common:location')} icon={MapPin}/>
                            <PhoneInput
                                international
                                defaultCountry="CH"
                                value={formData.phone}
                                onChange={(val) => { setIsDirty(true); setFormData(p => ({...p, phone: val})); }}
                                placeholder={t('common:phone')}
                                className="group flex h-10 w-full items-center rounded-xl border border-slate-300 bg-transparent px-4 text-sm transition-colors focus-within:border-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:focus-within:border-indigo-500"
                                numberInputProps={{
                                    className: "w-full border-0 bg-transparent text-slate-900 focus:outline-none focus:ring-0 dark:text-white"
                                }}
                            />
                        </div>
                    </CardContent>
            </Card>
            
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Home />{t('userprofile:billingAddress')}</CardTitle></CardHeader>
                     <CardContent className="space-y-6">
                        
<div>
    <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:accountType')}</label>
    <Select name="billingDetails.accountType" value={formData.billingDetails?.accountType || 'personal'} onValueChange={(value) => handleNestedValueChange('billingDetails.accountType', value)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
            <SelectItem value="personal">{t('userprofile:accountTypePersonal')}</SelectItem>
            <SelectItem value="business">{t('userprofile:accountTypeBusiness')}</SelectItem>
        </SelectContent>
    </Select>
</div>

{formData.billingDetails?.accountType === 'business' ? (
    <>
        <Input
            id="companyName"
            name="billingDetails.companyName"
            type="text"
            value={formData.billingDetails?.companyName || formData.billingDetails?.company || ''}
            onChange={handleInputChange}
            label={t('userprofile:companyName')}
            icon={Briefcase}
        />
        <Input
            id="vatNumber"
            name="billingDetails.vatNumber"
            type="text"
            value={formData.billingDetails?.vatNumber || ''}
            onChange={handleInputChange}
            label={t('userprofile:vatNumber')}
        />
    </>
) : (
    <Input
        id="billingName"
        name="billingDetails.name"
        type="text"
        value={formData.billingDetails?.name || ''}
        onChange={handleInputChange}
        label={t('userprofile:billingName')}
        icon={UserCheck}
    />
)}
                        <AddressAutocompleteInput initialValue={fullAddress} onAddressSelect={handleAddressSelect} disabled={saveStatus === 'saving'} label={t('userprofile:addressLookup')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2">
                                    <Input id="street" name="billingDetails.address.street" type="text" value={formData.billingDetails?.address?.street || ''} onChange={handleInputChange} label={t('userprofile:streetAddressLine1')} />
                                </div>
                                <div className="md:col-span-2">
                                    <Input id="street2" name="billingDetails.address.street2" type="text" value={formData.billingDetails?.address?.street2 || ''} onChange={handleInputChange} label={t('userprofile:streetAddressLine2')} />
                                </div>
                            <Input id="city" name="billingDetails.address.city" type="text" value={formData.billingDetails?.address?.city || ''} onChange={handleInputChange} label={t('userprofile:city')} />
                            <Input id="state" name="billingDetails.address.state" type="text" value={formData.billingDetails?.address?.state || ''} onChange={handleInputChange} label={t('userprofile:state')} />
                            <Input id="postalCode" name="billingDetails.address.postalCode" type="text" value={formData.billingDetails?.address?.postalCode || ''} onChange={handleInputChange} label={t('userprofile:postalCode')} />
                            <Select
                                name="billingDetails.address.country"
                                value={formData.billingDetails?.address?.country || ''}
                                onValueChange={(value) => handleNestedValueChange('billingDetails.address.country', value)}
                            >
                                <SelectTrigger id="country">
                                    <SelectValue placeholder={t('userprofile:country')} />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-h-[20rem] overflow-y-auto">
                                    {allCountries.map(country => (
                                        <SelectItem key={country.value} value={country.value}>
                                            {country.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Globe />{t('userprofile:regionalSettings')}</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:language')}</label>
                            <Select name="settings.language" value={formData.settings?.language || 'de'} onValueChange={(value) => handleNestedValueChange('settings.language', value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{languageOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:currency')}</label>
                            <Select name="settings.currency" value={formData.settings?.currency || 'EUR'} onValueChange={(value) => handleNestedValueChange('settings.currency', value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{currencyOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:timeZone')}</label>
                            <Select name="settings.timeZone" value={formData.settings?.timeZone || 'Europe/Berlin'} onValueChange={(value) => handleNestedValueChange('settings.timeZone', value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent position="popper" className="max-h-[20rem] overflow-y-auto">
                                    {timeZoneOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:dateFormat')}</label>
                            <Select name="settings.dateFormat" value={formData.settings?.dateFormat || 'DD.MM.YYYY'} onValueChange={(value) => handleNestedValueChange('settings.dateFormat', value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{dateFormatOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:timeFormat')}</label>
                            <Select name="settings.timeFormat" value={formData.settings?.timeFormat || '24h'} onValueChange={(value) => handleNestedValueChange('settings.timeFormat', value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{timeFormatOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Eye />{t('userprofile:privacy')}</CardTitle></CardHeader>
                    <CardContent>
                    <label htmlFor="profileVisibility" className="text-sm font-medium text-foreground mb-2 block">{t('userprofile:profileVisibility')}</label>
                        <Select name="profileVisibility" value={formData.profileVisibility} onValueChange={(value) => { setIsDirty(true); setFormData(p => ({...p, profileVisibility: value})); }}>
                            <SelectTrigger id="profileVisibility"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="public">{t('userprofile:public')}</SelectItem>
                                <SelectItem value="connections_only">{t('userprofile:connectionsOnly')}</SelectItem>
                                <SelectItem value="private">{t('userprofile:private')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
                
            </form>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Mail />{t('common:emailAddress')}</CardTitle></CardHeader>
                <CardContent>
                    {!isChangingEmail ? (
                        <div className="flex items-center justify-between">
                            <span>{user?.email}</span>
                            <Button variant="outline" size="sm" onClick={() => setIsChangingEmail(true)}>{t('userprofile:changeEmail')}</Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{t('userprofile:changeEmailInstructions')}</p>
                            <Input id="newEmail" name="newEmail" type="email" value={emailChangeData.newEmail} onChange={handleEmailInputChange} label={t('userprofile:newEmailAddress')} autoComplete="off" />
                            <Input id="emailChangeCurrentPassword" name="currentPassword" type="password" value={emailChangeData.currentPassword} onChange={handleEmailInputChange} label={t('userprofile:currentPasswordToConfirm')} autoComplete="new-password" />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setIsChangingEmail(false)} disabled={isSubmittingEmailChange}>{t('common:cancel')}</Button>
                                <Button onClick={handleRequestEmailChange} disabled={isSubmittingEmailChange}>{isSubmittingEmailChange ? t('common:sending') : t('userprofile:sendVerification')}</Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Bell />{t('userprofile:notifications')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label htmlFor="email-notifications" className="font-medium text-sm flex items-center gap-2">
                            {t('userprofile:emailNotifications')}
                            <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button"><Info className="h-4 w-4 text-muted-foreground"/></button></TooltipTrigger><TooltipContent><p>{t('userprofile:emailNotificationsDescription')}</p></TooltipContent></Tooltip></TooltipProvider>
                        </label>
                        <Switch id="email-notifications" checked={formData.settings?.notificationPreferences?.email || false} onCheckedChange={(checked) => handleNestedValueChange('settings.notificationPreferences.email', checked)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <label htmlFor="in-app-notifications" className="font-medium text-sm flex items-center gap-2">
                           {t('userprofile:inAppNotifications')}
                            <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button"><Info className="h-4 w-4 text-muted-foreground"/></button></TooltipTrigger><TooltipContent><p>{t('userprofile:inAppNotificationsDescription')}</p></TooltipContent></Tooltip></TooltipProvider>
                        </label>
                         <Switch id="in-app-notifications" checked={formData.settings?.notificationPreferences?.inApp || false} onCheckedChange={(checked) => handleSwitchChange('settings.notificationPreferences.inApp', checked)} />
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                 <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard />{t('userprofile:paymentMethods')}</CardTitle></CardHeader>
                 <CardContent>
                    <SavedPaymentMethodsManager userId={user?.id || user?._id} mode="manage" />
                 </CardContent>
            </Card>

            <form onSubmit={handleChangePassword}>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Lock />{t('userprofile:passwordAndSecurity')}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Input id="currentPassword" name="currentPassword" type="password" value={passwordData.currentPassword} onChange={handlePasswordInputChange} label={t('userprofile:currentPassword')} />
                        <Input id="newPassword" name="newPassword" type="password" value={passwordData.newPassword} onChange={handlePasswordInputChange} label={t('userprofile:newPassword')} />
                        <Input id="confirmNewPassword" name="confirmNewPassword" type="password" value={passwordData.confirmNewPassword} onChange={handlePasswordInputChange} label={t('userprofile:confirmNewPassword')} />
                        <div className="flex justify-end">
                            <Button type="submit" variant="secondary" disabled={isSavingPassword}>
                                {isSavingPassword ? t('common:saving') : t('userprofile:changePassword')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>

            <Card className="border-destructive">
                <CardHeader></CardHeader>
                <CardContent className="space-y-6 divide-y">
                    <div className="flex items-center justify-between pt-6 first:pt-0">
                        <div>
                            <h3 className="font-semibold">{t('userprofile:deactivateAccount')}</h3>
                            <p className="text-sm text-muted-foreground">{t('userprofile:deactivateDescription')}</p>
                        </div>
                        <Button variant="outline" onClick={() => {
                            if (window.confirm(t('userprofile:confirmDeactivate'))) {
                                logout();
                                toast.success(t('userprofile:accountDeactivated'));
                            }
                        }}>
                            {t('userprofile:deactivateAccount')}
                        </Button>
                    </div>
                    <div className="flex items-center justify-between pt-6">
                        <div>
                            <h3 className="font-semibold text-destructive">{t('userprofile:deleteAccount')}</h3>
                            <p className="text-sm text-muted-foreground">{t('userprofile:deleteDescription')}</p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline">
                                {t('userprofile:deleteAccount')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('userprofile:confirmDeleteTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('userprofile:confirmDeleteDescription')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                              <AlertDialogAction onClick={async () => {
                                  try {
                                      const res = await requestAccountDeletion();
                                      toast.success(res.message);
                                  } catch (err) {
                                      toast.error(err.response?.data?.message || t('common:errorGeneric'));
                                  }
                              }}>
                                {t('userprofile:sendConfirmationEmail')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default UserProfileSettings;