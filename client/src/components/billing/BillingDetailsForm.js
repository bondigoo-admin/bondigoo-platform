import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card.tsx";
import { Button } from "../ui/button.tsx";
import { Home, Edit, AlertCircle } from 'lucide-react';

export const BillingDetailsForm = ({ profile }) => {
  const { t, i18n } = useTranslation(['settings', 'userprofile']);
  const navigate = useNavigate();

  const billingAddress = profile?.billingDetails?.address;
  const billingName = profile?.billingDetails?.name || `${profile?.firstName} ${profile?.lastName}`;

  const handleEditAddress = () => {
    // Navigate the user directly to the profile settings tab to edit their address
    navigate('/settings?tab=profile');
  };
  
  const hasAddress = billingAddress && (billingAddress.street || billingAddress.city);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            {t('userprofile:billingAddress', 'Billing Address')}
        </CardTitle>
        <CardDescription>
          {t('userprofile:billingAddressSourceDescription', 'Your billing address is managed in your profile settings to ensure consistency across the platform.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasAddress ? (
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">{billingName}</p>
            {billingAddress.street && <p>{billingAddress.street}</p>}
            {(billingAddress.city || billingAddress.state || billingAddress.postalCode) && (
              <p>{`${billingAddress.city || ''}${billingAddress.state ? `, ${billingAddress.state}` : ''} ${billingAddress.postalCode || ''}`.trim()}</p>
            )}
           {billingAddress.country && (
              <p>
                {(() => {
                  try {
                    // Attempt to display the full country name.
                    return new Intl.DisplayNames([i18n.language.split('-')[0] || 'en'], { type: 'region' }).of(billingAddress.country);
                  } catch (e) {
                    // If it fails (e.g., invalid code), fall back to displaying the code itself.
                    return billingAddress.country;
                  }
                })()}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed text-muted-foreground">
            <AlertCircle className="h-6 w-6 flex-shrink-0" />
            <p className="text-sm">{t('userprofile:noBillingAddressSet', 'No billing address has been set. Please add one in your profile.')}</p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={handleEditAddress}>
          <Edit className="mr-2 h-4 w-4" />
          {hasAddress ? t('userprofile:editAddressInProfile', 'Edit Address in Profile') : t('userprofile:addAddressInProfile', 'Add Address in Profile')}
        </Button>
      </CardFooter>
    </Card>
  );
};