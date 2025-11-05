import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Banknote } from 'lucide-react';
import { useQuery } from 'react-query';
import { getSessionTypes, getTranslations } from '../services/adminAPI';
import { getCoachProgramsForDiscounts } from '../services/discountAPI';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { toast } from 'react-hot-toast';

// Import our pricing section components
import BaseRateSection from './pricing/BaseRateSection';
import LiveSessionRateSection from './pricing/LiveSessionRateSection';
import SessionTypeRatesSection from './pricing/SessionTypeRatesSection';
import TimeBasedRatesSection from './pricing/TimeBasedRatesSection';
import SpecialPeriodsSection from './pricing/SpecialPeriodsSection';
import DiscountsSection from './pricing/DiscountsSection'; // Import the new section

const PricingSection = () => {
  const { t, i18n } = useTranslation(['common', 'coachSettings']);
  const { user } = useAuth();
  const userId = user?.id;

  logger.info('[PricingSection] Component rendered with userId:', { userId });

  // Fetch session types
  const { 
    data: sessionTypes, 
    isLoading: isLoadingTypes,
    error: sessionTypesError
  } = useQuery('sessionTypes', getSessionTypes, {
    refetchOnWindowFocus: false,
    onError: (error) => {
      logger.error('[PricingSection] Error fetching session types:', error);
      toast.error(t('coachSettings:errorFetchingSessionTypes'));
    }
  });

  // Fetch translations for session types
  const { 
    data: sessionTypeTranslations,
    isLoading: isLoadingTranslations,
    error: translationsError
  } = useQuery(
    ['sessionTypeTranslations', i18n.language],
    () => getTranslations('sessionTypes', i18n.language),
    {
      enabled: !!sessionTypes,
      refetchOnWindowFocus: false,
      onError: (error) => {
        logger.error('[PricingSection] Error fetching translations:', error);
        toast.error(t('coachSettings:errorFetchingTranslations'));
      }
    }
  );

  // Fetch coach's programs for the discount selector
 const { 
    data: programs, 
    isLoading: isLoadingPrograms,
    isError: isProgramsError,
    error: programsError
  } = useQuery(['coachPrograms', userId], () => getCoachProgramsForDiscounts(userId), {
    enabled: !!userId,
    refetchOnWindowFocus: false,
    onSuccess: (data) => {
        logger.info('[PricingSection] useQuery for coachPrograms SUCCEEDED. Data received:', { data });
    },
    onError: (error) => {
        logger.error('[PricingSection] useQuery for coachPrograms FAILED.', { 
            error, 
            errorMessage: error.message 
        });
        // The toast error already exists, no need to change it
    }
  });

  logger.info('[PricingSection] Current state of programs query:', { 
    isLoadingPrograms, 
    isProgramsError, 
    programsError: programsError?.message, 
    programsData: programs 
  });

  // Helper function for getting translated session type names
  const getTranslatedSessionTypeName = (typeId) => {
    if (!sessionTypes || !sessionTypeTranslations) return '';
    
    const type = sessionTypes.find(t => t.id === typeId);
    if (!type) return '';
    
    const translationKey = `sessionTypes_${typeId}`;
    return sessionTypeTranslations?.translations?.[translationKey]?.translation || type.name;
  };

  const isLoading = isLoadingTypes || isLoadingTranslations || isLoadingPrograms;
  const error = sessionTypesError || translationsError || programsError;

  const programsForDiscountSection = programs?.docs || [];
  logger.info('[PricingSection] Data being passed to DiscountsSection component:', { programsForDiscountSection });

   if (isLoading) {
    return (
      <section className="space-y-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Banknote className="h-6 w-6" /> {t('coachSettings:pricing')}
        </h2>
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed bg-muted/50">
          <p className="text-muted-foreground">{t('common:loading')}</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Banknote className="h-6 w-6" /> {t('coachSettings:pricing')}
        </h2>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive-foreground">{t('coachSettings:errorLoadingPricing')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
        <Banknote className="h-6 w-6" />
        {t('coachSettings:pricing')}
      </h2>

      <div className="flex items-start gap-4 rounded-lg border bg-muted/50 p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
            <p className="font-semibold text-foreground">
              {t('coachSettings:grossRatesInfo', 'Please note: All rates you enter are gross rates. Applicable VAT and platform fees will be deducted from these amounts.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('coachSettings:pricingHierarchyInfo', 'If a booking qualifies for multiple automatic discounts (e.g., a special period and a time-based rate), the system automatically applies the one that provides the biggest saving for the client. Discount codes are evaluated separately against this best offer.')}
            </p>
        </div>
      </div>

      <div className="space-y-8">
        <BaseRateSection 
          userId={userId} 
        />

         <LiveSessionRateSection
          userId={userId}
        />

        <SessionTypeRatesSection 
          userId={userId}
          sessionTypes={sessionTypes}
          getTranslatedSessionTypeName={getTranslatedSessionTypeName}
        />

        <TimeBasedRatesSection 
          userId={userId}
          sessionTypes={sessionTypes}
          getTranslatedSessionTypeName={getTranslatedSessionTypeName}
        />

        <SpecialPeriodsSection 
          userId={userId}
          sessionTypes={sessionTypes}
          getTranslatedSessionTypeName={getTranslatedSessionTypeName}
        />

        <DiscountsSection
          userId={userId}
          sessionTypes={sessionTypes || []}
          programs={programsForDiscountSection}
          getTranslatedSessionTypeName={getTranslatedSessionTypeName}
        />
      </div>
    </section>
  );
};

export default PricingSection;