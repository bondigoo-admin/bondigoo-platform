import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../../utils/logger';
import { format } from 'date-fns';
import { Switch } from '../ui/switch.tsx';
import { Label } from '../ui/label.tsx';
import { Button } from '../ui/button.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Input } from '../ui/input.tsx';
import { Trash2, PlusCircle, Loader2, Upload, Clock, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import api from '../../services/api'; 
import { useAuth } from '../../contexts/AuthContext';
import { useSubmitVerificationDocument } from '../../hooks/useCoach';
import { getVerificationUploadSignature } from '../../services/coachAPI';
import axios from 'axios';

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/';

const fetchRegistries = async () => {
  const { data } = await api.get('/api/coaches/insurance-registries');
  return data;
};

const InsuranceRecognitionSettings = ({ coachSettings, onSettingsChange, onUpdate }) => {
  const { t } = useTranslation(['settings', 'common']);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRecognized, setIsRecognized] = useState(false);
  const [registries, setRegistries] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newRegistry, setNewRegistry] = useState({ name: '', therapistId: '' });
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    if (coachSettings?.insuranceRecognition) {
      setIsRecognized(coachSettings.insuranceRecognition.isRecognized || false);
      setRegistries(coachSettings.insuranceRecognition.registries || []);
    }
  }, [coachSettings]);

  const { data: availableRegistries, isLoading: isLoadingRegistries } = useQuery(
    'insuranceRegistries',
    fetchRegistries
  );
  
  const submitVerification = useSubmitVerificationDocument();

  const mutation = useMutation(
    (updatedSettings) => onSettingsChange(updatedSettings),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['coachSettings', user?._id]);
      },
      onError: () => {
        toast.error(t('insurance.updateError'));
      },
    }
  );

  const handleToggleRecognized = (checked) => {
    setIsRecognized(checked);
    const updatedRegistries = checked ? registries : [];
    setRegistries(updatedRegistries);
    mutation.mutate({
      insuranceRecognition: {
        isRecognized: checked,
        registries: updatedRegistries,
      },
    });
  };

  const handleAddRegistry = () => {
    setIsAdding(true);
  };
  
  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewRegistry({ name: '', therapistId: '' });
  };

  const handleRemoveRegistry = (index) => {
    const registryToRemove = registries[index];
    // OPTIONAL: If the registry had a publicId for a document, you might queue it for deletion here
    // but the final deletion upon status update/removal is best handled on the backend for safety.
    
    const newRegistries = registries.filter((_, i) => i !== index);
    setRegistries(newRegistries);
    mutation.mutate({
      insuranceRecognition: { isRecognized, registries: newRegistries },
    });
  };

  const handleNewRegistryChange = (field, value) => {
    setNewRegistry(prev => ({...prev, [field]: value}));
  };
  
  const handleSaveNewRegistry = () => {
    const trimmedId = newRegistry.therapistId.trim();

    if (!newRegistry.name || !trimmedId) {
        toast.error(t('insurance.validationError', 'Please fill out both fields.'));
        return;
    }

    const isDuplicate = registries.some(
        reg => reg.name === newRegistry.name
    );

    if (isDuplicate) {
        toast.error(t('insurance.duplicateNameError', 'This registry name has already been added.'));
        return;
    }

    const updatedRegistries = [...registries, { name: newRegistry.name, therapistId: trimmedId, status: 'unverified' }];
    mutation.mutate({
      insuranceRecognition: { isRecognized, registries: updatedRegistries },
    }, {
        onSuccess: () => {
            queryClient.invalidateQueries(['coachSettings', user?._id]);
            handleCancelAdd();
        }
    });
  };

const handleUploadFile = async (event, registryIndex) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadingIndex(registryIndex);
    const registry = registries[registryIndex];

    try {
        const signatureData = await getVerificationUploadSignature();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signatureData.apiKey);
        formData.append('timestamp', signatureData.timestamp);
        formData.append('signature', signatureData.signature);
        formData.append('folder', signatureData.folder);
        formData.append('upload_preset', 'insurance_verification_docs');
        
        const resourceTypeForUrl = signatureData.resource_type || 'auto';
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${resourceTypeForUrl}/upload`;
        
        const cloudinaryResponse = await axios.post(cloudinaryUrl, formData);
        
        const submissionPayload = {
            registryName: registry.name,
            publicId: cloudinaryResponse.data.public_id,
            filename: file.name
        };

        submitVerification.mutate(submissionPayload, {
            onSuccess: (updatedInsuranceRecognitionData) => {
                
                if (onUpdate) {
                    onUpdate(updatedInsuranceRecognitionData);
                }
            }
        });

    } catch (error) {
        logger.error('Verification upload failed', { error });
        toast.error(t('insurance.uploadError', 'File upload failed. Please try again.'));
    } finally {
        setUploadingIndex(null);
    }
};
  
  const getStatusComponent = (reg, index) => {
      const isUploading = uploadingIndex === index;
      const tKey = `insurance.status.${reg.status.toLowerCase()}`;
      
      switch (reg.status) {
          case 'pending_review':
              return (
                  <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                      <Clock className="mr-2 h-4 w-4" />
                      {t(tKey, 'Pending Review')}
                  </div>
              );
          case 'verified':
              return (
                  <div className="flex items-center text-green-600 dark:text-green-400">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {t(tKey, 'Verified')} ({format(new Date(reg.expiryDate), 'MMM yyyy')})
                  </div>
              );
          case 'rejected':
              return (
                  <div className="flex flex-col text-red-600 dark:text-red-400">
                      <div className="flex items-center">
                          <XCircle className="mr-2 h-4 w-4" />
                          {t(tKey, 'Rejected')}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                          {t(`insurance.rejectionReason.${reg.rejectionReasonKey}`, 'Please re-upload.')}
                      </p>
                  </div>
              );
          case 'unverified':
          default:
              return (
                  <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fileInputRef.current.click()}
                      disabled={isUploading}
                  >
                      {isUploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('common:uploading')}
                          </>
                      ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            {t('insurance.uploadForVerification')}
                          </>
                      )}
                  </Button>
              );
      }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('insurance.title')}</CardTitle>
        <CardDescription>{t('insurance.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="is-recognized"
            checked={isRecognized}
            onCheckedChange={handleToggleRecognized}
            disabled={mutation.isLoading}
          />
          <Label htmlFor="is-recognized">{t('insurance.isRecognizedLabel')}</Label>
        </div>

        {isRecognized && (
          <div className="space-y-4 pt-4 border-t">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => handleUploadFile(e, fileInputRef.current.dataset.registryIndex)} 
                accept="application/pdf,image/*" 
            />
            <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1.5fr_1.5fr_auto] items-center gap-x-4 px-4 py-2 bg-muted/50">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{t('insurance.registryName')}</div>
                    <div className="hidden sm:block text-xs font-semibold uppercase text-muted-foreground">{t('insurance.therapistId')}</div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{t('insurance.status')}</div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground text-right">{t('common:actions')}</div>
                </div>
                
                {registries.length > 0 ? (
                    registries.map((reg, index) => (
                        <div key={index} className="grid grid-cols-2 sm:grid-cols-[1fr_1.5fr_1.5fr_auto] items-center gap-x-4 p-4 border-t">
                            {/* Registry Name (Visible on all sizes) */}
                            <p className="text-sm font-medium text-foreground truncate">{reg.name}</p>
                            
                            {/* Therapist ID (Hidden on mobile) */}
                            <p className="hidden sm:block text-sm text-muted-foreground truncate">{reg.therapistId}</p>
                            
                            {/* Status Component */}
                            <div 
                                className="col-span-2 sm:col-span-1" 
                                onClick={() => reg.status === 'unverified' && fileInputRef.current.setAttribute('data-registry-index', index) && fileInputRef.current.click()}
                            >
                                {getStatusComponent(reg, index)}
                            </div>
                            
                            {/* Remove Button */}
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveRegistry(index)} disabled={mutation.isLoading || uploadingIndex === index} className="text-destructive hover:text-destructive justify-self-end">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))
                ) : (
                    !isAdding && (
                        <div className="text-center p-6 border-t">
                            <p className="text-sm text-muted-foreground">{t('insurance.noRegistries', 'No registrations added yet.')}</p>
                        </div>
                    )
                )}
            </div>

            {!isAdding ? (
                <Button variant="outline" size="sm" onClick={handleAddRegistry} disabled={mutation.isLoading}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('insurance.addRegistry')}
                </Button>
            ) : (
                <div className="flex flex-col gap-4 p-4 rounded-lg border border-primary/20 bg-muted/50">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>{t('insurance.registryName')}</Label>
                          <Select
                            value={newRegistry.name}
                            onValueChange={(value) => handleNewRegistryChange('name', value)}
                            disabled={isLoadingRegistries || mutation.isLoading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('insurance.selectPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRegistries?.map((r) => (
                                <SelectItem key={r.name} value={r.name}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('insurance.therapistId')}</Label>
                          <Input
                            value={newRegistry.therapistId}
                            onChange={(e) => handleNewRegistryChange('therapistId', e.target.value)}
                            placeholder="e.g. EMR-12345"
                            disabled={mutation.isLoading}
                          />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={handleCancelAdd} disabled={mutation.isLoading}>
                            {t('common:cancel')}
                        </Button>
                        <Button onClick={handleSaveNewRegistry} disabled={mutation.isLoading}>
                             {mutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('common:save')}
                        </Button>
                    </div>
                </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InsuranceRecognitionSettings;