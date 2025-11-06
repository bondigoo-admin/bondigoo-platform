import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getPriceConfiguration } from '../services/priceAPI';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import LoadingSpinner from './LoadingSpinner';
import { Zap, CalendarCheck, LayoutGrid, ArrowRight, Tag, Clock, Banknote, Sparkles, ShieldAlert, Edit } from 'lucide-react';
import LiveSessionClientRequestModal from './LiveSessionClientRequestModal';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { logger } from '../utils/logger'; // ADDED FOR LOGGING

const localeMap = {
  en: enUS,
  de,
  fr,
};

const ServiceListItem = ({ icon, title, description, price, buttonText, onButtonClick, buttonDisabled = false, tooltipContent = '', isOwnProfile, onEditClick }) => {
    const IconComponent = icon;
    const { t } = useTranslation(['common']);
    return (
        <li className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4">
            <div className="flex items-start gap-4 flex-1">
                <IconComponent className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-lg">{title}</h3>
                    {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
                    <div className="flex items-center gap-2 mt-2 text-sm">
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium text-foreground">{price}</p>
                    </div>
                </div>
            </div>
            {isOwnProfile ? (
                 <Button variant="outline" onClick={onEditClick} className="w-full sm:w-auto">
                    <Edit className="h-4 w-4 mr-2" />
                    {t('common:edit', 'Edit')}
                 </Button>
            ) : (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="w-full sm:w-auto">
                                <Button variant="outline" onClick={onButtonClick} disabled={buttonDisabled} className="w-full sm:w-auto">
                                    {buttonText}
                                </Button>
                            </span>
                        </TooltipTrigger>
                        {tooltipContent && <TooltipContent><p>{tooltipContent}</p></TooltipContent>}
                    </Tooltip>
                </TooltipProvider>
            )}
        </li>
    );
};

const PromotionCard = ({ title, description, discount, conditions, onAction, getSessionTypeName }) => {
    const { t } = useTranslation(['common', 'coachprofile']);
    
    const appliesToText = useMemo(() => {
        if (!conditions.sessionTypes || conditions.sessionTypes.length === 0) return t('coachprofile:allSessions', 'All bookable sessions');
        
        const sessionNames = conditions.sessionTypes.map(id => getSessionTypeName(id)).filter(name => name && name !== t('coachprofile:standardSession', 'Standard Session'));
        
        if (sessionNames.length === 0) return t('coachprofile:specificSessions', 'Specific sessions');
        if (sessionNames.length <= 2) return sessionNames.join(' & ');
        return t('coachprofile:multipleSessionTypes', { count: sessionNames.length });
    }, [conditions.sessionTypes, getSessionTypeName, t]);

    return (
        <div 
          className="bg-background border rounded-lg p-4 flex flex-col gap-3 transition-colors duration-200 hover:bg-muted/40 cursor-pointer"
          onClick={onAction}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAction()}
        >
            <div className="flex justify-between items-start gap-2">
                <h4 className="font-semibold text-foreground">{title}</h4>
                <p className="text-base font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-3 py-0.5 rounded-full whitespace-nowrap">-{discount}%</p>
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t mt-auto">
                <Clock className="h-3 w-3 flex-shrink-0"/> 
                <span>{conditions.time} on {appliesToText}</span>
            </div>
        </div>
    );
};

const ServicesAndPricingTab = ({ coachId, coach, onTabChange, onLiveSessionClick, getTranslatedSessionTypeName, canViewPricing, isOwnProfile, onEditPricing }) => {
    const { t, i18n } = useTranslation(['common', 'coachprofile']);
    const navigate = useNavigate();
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const currentLocale = localeMap[i18n.language] || enUS;

    const { data: priceConfig, isLoading: isLoadingPrice, isError: isPriceError } = useQuery(
        ['priceConfig', coachId],
        () => getPriceConfiguration(coachId),
        { enabled: !!coachId && canViewPricing }
    );

    const activePromotions = useMemo(() => {
        if (!priceConfig) return { specialPeriods: [], timeBasedRates: [] };
        const now = new Date();
        const activePeriods = priceConfig.specialPeriods?.filter(p => p.active && new Date(p.endDate) >= now) || [];
        const activeTimeRates = priceConfig.timeBasedRates?.filter(p => p.active) || [];
        return {
            specialPeriods: activePeriods,
            timeBasedRates: activeTimeRates
        };
    }, [priceConfig]);
    
    const hasPromotions = activePromotions.specialPeriods.length > 0 || activePromotions.timeBasedRates.length > 0;

    const formatDaysOfWeek = (days) => {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        if (days.length === 7) return t('common:everyDay', 'Every Day');
        if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return t('common:weekdays', 'Weekdays');
        return days.map(d => t(`common:dayShort.${dayNames[d]}`, dayNames[d].substring(0,3))).join(', ');
    };

    if (!canViewPricing) {
        return (
            <div className="mt-4 p-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-400 text-amber-800 dark:text-amber-300 rounded-r-md flex items-start gap-4">
                <ShieldAlert className="h-6 w-6 flex-shrink-0 mt-1" />
                <div>
                    <h3 className="font-bold text-lg">{t('coachprofile:pricingNotVisibleTitle', 'Preise nicht sichtbar')}</h3>
                    <p className="mt-1">{t('coachprofile:pricingNotVisibleDesc', 'Dieser Coach hat seine Preise so eingestellt, dass sie für Sie nicht sichtbar sind. Um die Preise zu sehen, müssen Sie eine Verbindung zum Coach herstellen.')}</p>
                </div>
            </div>
        );
    }

    if (isLoadingPrice) {
        return <div className="flex justify-center items-center p-8"><LoadingSpinner /></div>;
    }

    if (isPriceError) {
        return <div className="text-center text-red-500 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">{t('coachprofile:errorFetchPricing')}</div>;
    }
    
    const hasLiveRate = priceConfig?.liveSessionRate?.amount > 0;
    const hasSessionRates = priceConfig?.sessionTypeRates?.length > 0;
    const hasBaseRate = priceConfig?.baseRate?.amount > 0;
    const hasPrograms = coach?.programs?.length > 0;
    const hasAnyService = hasLiveRate || hasSessionRates || hasBaseRate || hasPrograms;

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('coachprofile:serviceMenu', 'Service-Menü')}</CardTitle>
                            <CardDescription>{t('coachprofile:serviceMenuDesc', 'Finden Sie die verschiedenen Möglichkeiten der Zusammenarbeit mit diesem Coach.')}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {hasAnyService ? (
                                <ul className="divide-y divide-border">
                                    {hasLiveRate && (
                                        <ServiceListItem
                                            icon={Zap}
                                            title={t('coachprofile:liveSessions', 'Live-Sitzungen')}
                                            description={t('coachprofile:liveSessionDescShort', 'Verbinden Sie sich sofort für eine spontane Coaching-Sitzung im Moment.')}
                                            price={`${priceConfig.liveSessionRate.amount.toFixed(2)} ${priceConfig.liveSessionRate.currency}/${t('common:min', 'Min.')}`}
                                            buttonText={coach.user.status === 'online' ? t('coachprofile:goLiveNow', 'Jetzt live gehen') : t('common:status.offline', 'Offline')}
                                            onButtonClick={() => setIsRequestModalOpen(true)}
                                            buttonDisabled={coach.user.status !== 'online'}
                                            tooltipContent={coach.user.status !== 'online' ? t('coachprofile:tooltip.offline', 'Der Coach ist derzeit für Live-Sitzungen nicht verfügbar.') : ''}
                                            isOwnProfile={isOwnProfile}
                                            onEditClick={onEditPricing}
                                        />
                                    )}

                                     {hasSessionRates && priceConfig.sessionTypeRates.map(rate => {
                                        // LOG 6: SHOWS THE ID BEING PASSED TO THE TRANSLATION FUNCTION FROM THIS COMPONENT
                                        logger.info(`[ServicesAndPricingTab] LOG 6: Rendering session type rate. Passing ID to getTranslatedSessionTypeName: ${rate.sessionType}`);
                                        return (
                                            <ServiceListItem
                                                key={rate.sessionType}
                                                icon={CalendarCheck}
                                                title={getTranslatedSessionTypeName(rate.sessionType)}
                                                description={t('coachprofile:bookableSessionDescShort', 'Planen Sie eine strukturierte Sitzung im Voraus über den Kalender.')}
                                                price={t('coachprofile:fromRatePerHour', { amount: rate.rate.amount.toFixed(2), currency: rate.rate.currency, unit: t('common:hr', 'Std.') })}
                                                onButtonClick={() => onTabChange('availability')}
                                                buttonText={t('common:bookSession', 'Sitzung buchen')}
                                                isOwnProfile={isOwnProfile}
                                                onEditClick={onEditPricing}
                                            />
                                        );
                                    })}

                                    {!hasSessionRates && hasBaseRate && (
                                         <ServiceListItem
                                            icon={CalendarCheck}
                                            title={t('coachprofile:standardSession', 'Standardsitzung')}
                                            description={t('coachprofile:bookableSessionDescShort', 'Planen Sie eine strukturierte Sitzung im Voraus über den Kalender.')}
                                            price={t('coachprofile:fromRatePerHour', { amount: priceConfig.baseRate.amount.toFixed(2), currency: priceConfig.baseRate.currency, unit: t('common:hr', 'Std.') })}
                                            onButtonClick={() => onTabChange('availability')}
                                            buttonText={t('common:bookSession', 'Sitzung buchen')}
                                            isOwnProfile={isOwnProfile}
                                            onEditClick={onEditPricing}
                                        />
                                    )}

                                    {hasPrograms && coach.programs.slice(0, 3).map(program => (
                                        <ServiceListItem
                                            key={program._id}
                                            icon={LayoutGrid}
                                            title={program.title}
                                            description={program.tagline || t('coachprofile:programDescShort', 'Ein geführter Prozess mit strukturierten Inhalten und Sitzungen.')}
                                            price={
                                                program.salePrice?.amount
                                                ? <><span className="line-through text-muted-foreground">{program.basePrice.amount.toFixed(2)}</span> {program.salePrice.amount.toFixed(2)} {program.basePrice.currency}</>
                                                : `${program.basePrice.amount.toFixed(2)} ${program.basePrice.currency}`
                                            }
                                            onButtonClick={() => navigate(`/programs/${program._id}`)}
                                            buttonText={t('common:viewDetails', 'Details ansehen')}
                                        />
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center py-12 px-4 border-2 border-dashed rounded-lg m-6">
                                    <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/30" />
                                    <p className="mt-4 font-medium text-muted-foreground">{t('coachprofile:noServicesAvailable', 'Dieser Coach hat noch keine Services konfiguriert.')}</p>
                                    <p className="mt-1 text-sm text-muted-foreground/80">{t('coachprofile:checkBackLater', 'Bitte schauen Sie später noch einmal vorbei.')}</p>
                                </div>
                            )}
                            
                            {coach.programs && coach.programs.length > 3 && (
                                <div className="p-6 border-t">
                                    <Button variant="secondary" className="w-full" onClick={() => onTabChange('programs')}>
                                        {t('coachprofile:viewAllPrograms', { count: coach.programs.length })} <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {hasPromotions && (
                    <div className="lg:col-span-4">
                         <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Tag className="h-6 w-6 text-primary" />
                                    <span>{t('coachprofile:activePromotions', 'Aktive Aktionen')}</span>
                                </CardTitle>
                                <CardDescription>{t('coachprofile:activePromotionsDesc', 'Diese Rabatte werden automatisch angewendet, wenn Sie eine qualifizierte Sitzung buchen.')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {activePromotions.specialPeriods.map(period => (
                                    <PromotionCard
                                        key={period._id}
                                        title={period.name}
                                        description={period.description}
                                        discount={period.rate.amount}
                                        conditions={{ time: `${format(new Date(period.startDate), 'MMM d', { locale: currentLocale })} - ${format(new Date(period.endDate), 'MMM d', { locale: currentLocale })}`, sessionTypes: period.sessionTypes }}
                                        onAction={() => onTabChange('availability')}
                                        getSessionTypeName={getTranslatedSessionTypeName}
                                    />
                                ))}
                                {activePromotions.timeBasedRates.map(rate => {
                                    const timeWindowTitle = `${formatDaysOfWeek(rate.dayOfWeek)} ${rate.timeRange.start} - ${rate.timeRange.end}`;
                                    return (
                                        <PromotionCard
                                            key={rate._id}
                                            title={rate.name || timeWindowTitle}
                                            description={rate.description}
                                            discount={rate.rate.amount}
                                            conditions={{ time: timeWindowTitle, sessionTypes: rate.sessionTypes }}
                                            onAction={() => onTabChange('availability')}
                                            getSessionTypeName={getTranslatedSessionTypeName}
                                        />
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
            {coach && <LiveSessionClientRequestModal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} coach={coach} onConfirmRequest={onLiveSessionClick} />}
        </>
    );
};

export default ServicesAndPricingTab;