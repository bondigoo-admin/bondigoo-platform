import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from 'react-query';
import { AuthContext } from '../contexts/AuthContext';
import { getUserDetails } from '../services/userAPI';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, User, Briefcase, Sun, Moon, Monitor,
    Cog, CreditCard, Palette, Globe, Banknote, AlertTriangle, Loader2, Shield
} from 'lucide-react';

import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { cn } from '../lib/utils';
import { Skeleton } from './ui/skeleton.jsx';

import { BillingCenter } from './billing/BillingCenter';
import UserProfileSettings from './UserProfileSettings';
import CoachSettings from './CoachSettings';
import PricingSection from './CoachSettings_pricing';
import InsuranceRecognitionSettings from './settings/InsuranceRecognitionSettings';
import BlockedUsersManagement from './BlockedUsersManagement';
import CoachPrivacySettings from './CoachPrivacySettings';

const GeneralSettingsTab = () => {
    const { t, i18n } = useTranslation(['settings']);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

    useEffect(() => {
        const root = window.document.documentElement;
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        root.classList.toggle('dark', isDark);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const handleLanguageChange = (lang) => {
        setCurrentLanguage(lang);
        i18n.changeLanguage(lang);
    };
    
    const ThemeOption = ({ value, label, icon: Icon }) => (
        <Button
            variant="ghost"
            size="sm"
            className={cn("flex-1 justify-center gap-2", theme === value && 'bg-background text-foreground shadow-sm')}
            onClick={() => setTheme(value)}
            aria-pressed={theme === value}
        >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
        </Button>
    );

   return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Palette /> {t('appearance')}</CardTitle>
                    <CardDescription>{t('appearanceDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center rounded-lg bg-muted p-1">
                        <ThemeOption value="light" label={t('light')} icon={Sun} />
                        <ThemeOption value="dark" label={t('dark')} icon={Moon} />
                        <ThemeOption value="system" label={t('system')} icon={Monitor} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Globe /> {t('language')}</CardTitle>
                    <CardDescription>{t('languageDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                        <SelectTrigger className="w-full md:w-[280px]">
                            <SelectValue placeholder={t('selectLanguage')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="de">Deutsch</SelectItem>
                            <SelectItem value="fr">Français</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>
        </div>
    );
};

const SecurityAndPrivacyTab = () => {
    const { user } = useContext(AuthContext);

    return (
        <div className="space-y-8">
            <BlockedUsersManagement />
            {user.role === 'coach' && <CoachPrivacySettings />}
        </div>
    );
};

const SettingsPage = ({ isEmbedded = false }) => {
    const { t } = useTranslation(['settings', 'common', 'header']);
    const { user, isAuthenticated } = useContext(AuthContext);
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const getTabFromQuery = () => new URLSearchParams(location.search).get(isEmbedded ? 'settings_tab' : 'tab') || 'general';
    const [activeTab, setActiveTab] = useState(getTabFromQuery());

    const { data: profile, isLoading, isError } = useQuery(
        ['userProfileDetails', user?._id], 
        getUserDetails,
        { enabled: !!user }
    );

    useEffect(() => {
        setActiveTab(getTabFromQuery());
    }, [location.search]);

    const handleTabChange = (tab) => {
        if (isEmbedded) {
            const newSearchParams = new URLSearchParams(location.search);
            newSearchParams.set('settings_tab', tab);
            navigate(`${location.pathname}?${newSearchParams.toString()}`, { replace: true });
        } else {
            navigate(`/settings?tab=${tab}`, { replace: true });
        }
    };
    
     const handleProfileUpdate = (updatedData) => {
        queryClient.setQueryData(['userProfileDetails', user?._id], updatedData);
    };

    const tabs = [
        { id: 'general', label: t('generalSettings'), icon: Cog, component: GeneralSettingsTab },
          {
          id: 'profile',
          label: t('header:profile'),
          icon: User,
          component: () => {
              if (isLoading || !profile) return <ProfileSettingsSkeleton />;
              if (isError) return <p>{t('errorFetchingProfile')}</p>;
              return <UserProfileSettings profile={profile} onProfileUpdate={handleProfileUpdate} />;
          }
        },
        { id: 'security', label: t('settings:securityAndPrivacy'), icon: Shield, component: SecurityAndPrivacyTab },
        { 
            id: 'billing', 
            label: t('header:billing'), 
            icon: CreditCard, 
            component: () => {
                if (isLoading || !profile) return <BillingCenterSkeleton />;
                if (isError) return <p>{t('errorFetchingProfile')}</p>;

                const safeProfile = JSON.parse(JSON.stringify(profile));

                if (!safeProfile.billingDetails) {
                safeProfile.billingDetails = {};
                }
                if (!safeProfile.billingDetails.address) {
                safeProfile.billingDetails.address = {};
                }
                
                if (!safeProfile.billingDetails.address.country) {
                delete safeProfile.billingDetails.address.country;
                }
                
                return <BillingCenter profile={safeProfile} onProfileUpdate={handleProfileUpdate} />;
            }
            },
       ...(user.role === 'coach' ? [
            { id: 'coach', label: t('coachSettings'), icon: Briefcase, component: CoachSettings },
            { id: 'pricing', label: t('coachSettings:pricing'), icon: Banknote, component: PricingSection },
        ] : []),
    ];

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold">{t('common:errorAuthentication')}</h2>
                <p className="text-muted-foreground mt-2">{t('authRequired')}</p>
            </div>
        );
    }
    
    return (
        <div className={cn(!isEmbedded && "container mx-auto max-w-7xl py-8 px-4")}>
            {!isEmbedded && (
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Settings className="h-8 w-8" />
                        {t('pageTitle')}
                    </h1>
                    <p className="mt-2 text-muted-foreground">{t('pageSubtitle')}</p>
                </header>
            )}
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col md:flex-row md:gap-8">
                <TabsList className="flex-col items-stretch justify-start h-auto p-1 mb-6 md:mb-0 md:w-1/4 lg:w-1/5">
                    {tabs.map((tab) => (
                         <TabsTrigger key={tab.id} value={tab.id} className="justify-start gap-3 px-3 py-2.5 text-base md:text-sm">
                            <tab.icon className="h-5 w-5" /> {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

               <main className="flex-1 min-w-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="mt-0"
                        >
                            {activeTab === 'general' && (
                                <TabsContent value="general" forceMount>
                                    <GeneralSettingsTab />
                                </TabsContent>
                            )}
                            {activeTab === 'profile' && (
                                <TabsContent value="profile" forceMount>
                                    {isLoading || !profile ? <ProfileSettingsSkeleton /> :
                                     isError ? <p>{t('errorFetchingProfile')}</p> :
                                     <UserProfileSettings profile={profile} onProfileUpdate={handleProfileUpdate} />}
                                </TabsContent>
                            )}
                            {activeTab === 'security' && (
                                <TabsContent value="security" forceMount>
                                    <SecurityAndPrivacyTab />
                                </TabsContent>
                            )}
                            {activeTab === 'billing' && (
                                <TabsContent value="billing" forceMount>
                                     {isLoading || !profile ? <BillingCenterSkeleton /> :
                                        isError ? <p>{t('errorFetchingProfile')}</p> :
                                        (() => {
                                            const safeProfile = JSON.parse(JSON.stringify(profile));
                                            if (!safeProfile.billingDetails) safeProfile.billingDetails = {};
                                            if (!safeProfile.billingDetails.address) safeProfile.billingDetails.address = {};
                                            if (!safeProfile.billingDetails.address.country) delete safeProfile.billingDetails.address.country;
                                            return <BillingCenter profile={safeProfile} onProfileUpdate={handleProfileUpdate} />;
                                        })()
                                    }
                                </TabsContent>
                            )}
                            {user.role === 'coach' && activeTab === 'coach' && (
                                <TabsContent value="coach" forceMount>
                                    <CoachSettings />
                                </TabsContent>
                            )}
                            {user.role === 'coach' && activeTab === 'pricing' && (
                                <TabsContent value="pricing" forceMount>
                                    <PricingSection />
                                </TabsContent>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </Tabs>
        </div>
    );
};

const ProfileSettingsSkeleton = () => (
    <div className="space-y-8">
        <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading profile...</p>
        </div>
        <Card>
            <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
                <Skeleton className="h-14 w-full" />
            </CardContent>
        </Card>
        <Card>
            <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
            <CardContent className="space-y-6">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
            </CardContent>
        </Card>
    </div>
);

const BillingCenterSkeleton = () => (
    <div className="space-y-8">
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
            <CardContent className="space-y-6">
                 <Skeleton className="h-14 w-full" />
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                 </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent>
                <Skeleton className="h-32 w-full" />
            </CardContent>
        </Card>
    </div>
);

export default SettingsPage;