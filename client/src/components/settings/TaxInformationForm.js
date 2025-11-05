import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getMyTaxInfo, updateMyTaxInfo } from '../../services/coachAPI';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../../contexts/AuthContext';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Home, Edit, AlertCircle } from 'lucide-react';

const TaxInformationForm = () => {
  const { t } = useTranslation(['coachSettings', 'common', 'userprofile']);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    isVatRegistered: false,
    vatNumber: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const billingAddress = user?.billingDetails?.address;
  const hasAddress = billingAddress && billingAddress.street;

  useEffect(() => {
    const fetchTaxInfo = async () => {
      try {
        const data = await getMyTaxInfo();
        setFormData(prev => ({ ...prev, ...data }));
      } catch (error) {
        // Error handling is managed by the API service
      } finally {
        setIsLoading(false);
      }
    };
    fetchTaxInfo();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVatToggle = (checked) => {
    setFormData((prev) => ({
      ...prev,
      isVatRegistered: checked,
      vatNumber: checked ? prev.vatNumber : '',
    }));
  };
  
  const handleEditAddress = () => {
    navigate('/settings?tab=profile');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateMyTaxInfo(formData);
      toast.success(t('taxForm.successUpdating'));
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.[0]?.msg || t('taxForm.errorUpdating');
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
        <Card className="border-none shadow-none">
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 mt-2 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter>
                <Skeleton className="h-10 w-24" />
            </CardFooter>
        </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>{t('taxForm.title')}</CardTitle>
          <CardDescription>
            {t('taxForm.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <Switch
              id="isVatRegistered"
              checked={formData.isVatRegistered}
              onCheckedChange={handleVatToggle}
            />
            <Label htmlFor="isVatRegistered" className="flex-grow cursor-pointer text-sm font-medium">
              {t('taxForm.vatRegisteredLabel')}
            </Label>
          </div>
          {formData.isVatRegistered && (
            <div className="space-y-2">
              <Label htmlFor="vatNumber">{t('taxForm.vatNumberLabel')}</Label>
              <Input
                id="vatNumber"
                name="vatNumber"
                value={formData.vatNumber}
                onChange={handleInputChange}
                placeholder={t('taxForm.vatNumberPlaceholder')}
              />
            </div>
          )}
          
          <fieldset className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <legend className="-ml-1 px-1 text-sm font-medium">{t('taxForm.billingAddressLegend')}</legend>
            <p className="text-sm text-muted-foreground">
              {t('userprofile:billingAddressSourceDescription', 'Your billing address is managed in your profile settings to ensure consistency across the platform.')}
            </p>
             {hasAddress ? (
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <Home className="h-6 w-6 text-muted-foreground mt-1 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{(user?.billingDetails?.name) || `${user?.firstName} ${user?.lastName}`}</p>
                  <p className="text-muted-foreground">{billingAddress.street}</p>
                  <p className="text-muted-foreground">{`${billingAddress.city || ''}, ${billingAddress.state || ''} ${billingAddress.postalCode || ''}`.trim().replace(/^,|,$/g, '')}</p>
                  <p className="text-muted-foreground">{billingAddress.country}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed text-muted-foreground">
                <AlertCircle className="h-6 w-6 flex-shrink-0" />
                <p className="text-sm">{t('userprofile:noBillingAddressSet', 'No billing address has been set. Please add one in your profile.')}</p>
              </div>
            )}
             <Button type="button" variant="outline" size="sm" onClick={handleEditAddress}>
                <Edit className="mr-2 h-4 w-4" />
                {hasAddress ? t('userprofile:editAddressInProfile', 'Edit Address in Profile') : t('userprofile:addAddressInProfile', 'Add Address in Profile')}
            </Button>
          </fieldset>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common:saving') : t('common:saveChanges')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export default TaxInformationForm;