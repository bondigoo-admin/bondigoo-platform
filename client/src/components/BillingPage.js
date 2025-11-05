import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { BillingCenter } from './billing/BillingCenter';
import { CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery } from 'react-query';
import { AuthContext } from '../contexts/AuthContext';
import { getUserDetails } from '../services/userAPI';

const BillingPage = () => {
  const { t } = useTranslation(['settings', 'header', 'common']);
  const { user } = useContext(AuthContext);

  const { data: profile, isLoading, isError, error } = useQuery(
    ['userProfileDetails', user?._id],
    getUserDetails,
    {
      enabled: !!user,
    }
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('common:loading', 'Loading...')}</span>
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-destructive">
          <AlertTriangle className="h-8 w-8 mb-2" />
          <p className="font-semibold">{t('settings:errorFetchingProfile', 'Could not load your profile data.')}</p>
          <p className="text-sm">{error?.message || t('common:errorTryAgain', 'An unexpected error occurred. Please try again later.')}</p>
        </div>
      );
    }

    return <BillingCenter profile={profile} onProfileUpdate={() => {/*empty*/}} />;
  };

  return (
    <div className="container mx-auto max-w-7xl py-8 px-4">
      <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <CreditCard className="h-8 w-8" />
              {t('header:billing', 'Billing & Invoices')}
          </h1>
          <p className="mt-2 text-muted-foreground">
              {t('settings:billingPageDescription', 'Manage your payment methods, view your complete payment history, and download invoices.')}
          </p>
      </header>
      {renderContent()}
    </div>
  );
};

export default BillingPage;