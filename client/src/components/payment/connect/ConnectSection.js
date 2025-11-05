import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, AlertCircle, CheckCircle, RefreshCw, Settings, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Alert, AlertDescription } from '../../../components/ui/alert.tsx';
import { useConnect } from '../../../hooks/useConnect';
import { logger } from '../../../utils/logger';
import LoadingStates from '../LoadingStates';
import { motion, AnimatePresence } from 'framer-motion';

export const ConnectSection = () => {
  const { t } = useTranslation(['common', 'payments']);
  const { 
    accountStatus, 
    isLoading, 
    error,
    isRedirecting,
    getAccountStatus, 
    createAccount,
    getDashboardLink,
    checkRequirements 
  } = useConnect();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        await getAccountStatus();
      } catch (error) {
        logger.error('[ConnectSection] Error in initial status fetch:', error);
      }
    };

    fetchStatus();
  }, [getAccountStatus]);

  const handleConnect = async (isResume = false) => {
    try {
      logger.info(`[ConnectSection] ${isResume ? 'Resuming' : 'Starting'} Connect action`);
      if (isResume && accountStatus?.status) {
        await getDashboardLink();
      } else {
        await createAccount();
      }
    } catch (error) {
      logger.error('[ConnectSection] Error handling connect:', error);
    }
  };

  const requirements = accountStatus ? checkRequirements(accountStatus) : {
    complete: false,
    missing: [],
    errors: []
  };

  if (isRedirecting) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingStates state="redirecting" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
            <CardTitle>{t('common:error')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
            <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    {t('payments:stripeConnect')}
                    {accountStatus && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          requirements?.complete ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 
                          accountStatus?.status ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {requirements?.complete ? t('payments:statusActive') :
                           accountStatus?.status ? t('payments:statusIncomplete') :
                           t('payments:statusInactive')}
                        </span>
                    )}
                </CardTitle>
                <CardDescription>
                  {t('payments:stripeConnectDescription', 'Manage your Stripe account to receive payments from clients.')}
                </CardDescription>
            </div>
            {accountStatus && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => getAccountStatus()}
                disabled={isLoading}
                className="flex-shrink-0"
                aria-label={t('payments:refreshStatus', 'Refresh status')}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {isLoading && !accountStatus ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center items-center py-6"
            >
              <LoadingStates state="initializing" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {accountStatus === null || !accountStatus?.status ? (
                <>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('payments:noConnectAccount')}
                    </AlertDescription>
                  </Alert>
                  <Button
                    className="w-full"
                    onClick={() => handleConnect(false)}
                    disabled={isLoading || isRedirecting}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {t('payments:startStripeSetup')}
                  </Button>
                </>
              ) : requirements?.complete ? (
                <>
                  <Alert variant="success">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('payments:accountActive')}
                    </AlertDescription>
                  </Alert>
                  <Button
                    className="w-full"
                    onClick={() => handleConnect(true)} 
                    disabled={isLoading || isRedirecting}
                    variant="outline"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {t('payments:editStripeAccount')}
                  </Button>
                </>
              ) : (
                <>
                  <Alert variant="warning">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('payments:setupIncomplete')}
                    </AlertDescription>
                  </Alert>
                  <Button
                    className="w-full"
                    onClick={() => handleConnect(true)}
                    disabled={isLoading || isRedirecting}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    {t('payments:completeStripeSetup')}
                  </Button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};

export default ConnectSection;