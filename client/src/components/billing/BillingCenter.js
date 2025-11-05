import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { PaymentHistory } from './PaymentHistory';
import SavedPaymentMethodsManager from '../payment/SavedPaymentMethodsManager';
import { ConnectProvider } from '../../contexts/ConnectContext';
import { ConnectSection } from '../payment/connect/ConnectSection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Home, CreditCard } from 'lucide-react';
import { BillingDetailsForm } from './BillingDetailsForm';

export const BillingCenter = ({ profile }) => {
  const { t } = useTranslation(['common', 'userprofile']);
  const { user } = useContext(AuthContext);
  
  return (
    <div className="space-y-8">
      {user?.role === 'coach' && (
        <ConnectProvider>
          <ConnectSection />
        </ConnectProvider>
      )}

      <BillingDetailsForm profile={profile} />
      
       <Card>
                       <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard />{t('userprofile:paymentMethods')}</CardTitle></CardHeader>
                       <CardContent>
                          <SavedPaymentMethodsManager userId={user.id} mode="manage" />
                       </CardContent>
                  </Card>

      <PaymentHistory />
    </div>
  );
};