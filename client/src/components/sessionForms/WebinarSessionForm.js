import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { 
    Calendar as CalendarIcon, ChevronDown, Video, Info, PlusCircle, X as IconX, Clock, ImageIcon, Eye, EyeOff, Users, 
    FileText, Trash2, UploadCloud, UserX, Link as LinkIcon, Globe, DollarSign, 
    Users2, MenuSquare, Edit, Star
} from 'lucide-react';
import { de } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Switch } from '../ui/switch.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Calendar, DateTimePicker, TimePicker } from '../ui/calendar.jsx';
import EarningsBreakdown from '../shared/EarningsBreakdown';

const DisplayField = ({ label, value, icon: Icon, children, fullWidth = false, className = '' }) => {
    const { t } = useTranslation(['common']);
    return (
      <div className={cn("flex items-start gap-2 py-2 text-sm", fullWidth ? "col-span-1 md:col-span-2" : "", className)}>
        {Icon && <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />}
        {label && <strong className="font-semibold text-muted-foreground whitespace-nowrap">{label}:</strong>}
        <div className="text-foreground break-words w-full">
          {children || (value === null || value === undefined || value === '' ? <span className="italic text-muted-foreground">{t('common:notSet')}</span> : value)}
        </div>
      </div>
    );
};

DisplayField.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.node]),
  icon: PropTypes.elementType,
  children: PropTypes.node,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};

const WebinarSessionForm = ({
    formData,
    handleInputChange,
    errors,
    currencySymbols,
    handleDateChange,
    priceRelatedData,
    sessionTypeData,
    handleAddWebinarSlot,
    handleRemoveWebinarSlot,
    handleWebinarSlotChange,
    handleRemoveCourseMaterial,
    renderSection = 'basic', 
    bookingData,
    isDisplayMode = false,
  }) => {
    const { t, i18n } = useTranslation(['common', 'managesessions', 'payments']);

  const { isLoading: isLoadingPrice, data: priceBreakdownData } = priceRelatedData || {};

  const isEarlyBirdFeatureEnabled = 
  (!isDisplayMode && sessionTypeData && (sessionTypeData.includes('earlyBirdDeadline') || sessionTypeData.includes('earlyBirdPrice'))) ||
  (isDisplayMode && (!!formData.earlyBirdPrice || !!formData.earlyBirdDeadline));

  const initialGrantState = isEarlyBirdFeatureEnabled && (!!formData.earlyBirdPrice || !!formData.earlyBirdDeadline);

  const [grantEarlyBird, setGrantEarlyBird] = React.useState(initialGrantState);
  const [isEarlyBirdGrantExpanded, setIsEarlyBirdGrantExpanded] = React.useState(
    () => !!(formData.earlyBirdPrice || formData.earlyBirdDeadline) && isEarlyBirdFeatureEnabled
  );
  const [isPricingDetailsExpanded, setIsPricingDetailsExpanded] = React.useState(isEarlyBirdGrantExpanded);
  
  const [isDraggingImages, setIsDraggingImages] = React.useState(false);
  const [isDraggingMaterials, setIsDraggingMaterials] = React.useState(false);
  const [draggedImageIdentifier, setDraggedImageIdentifier] = React.useState(null);
  const [isDraggingOverMain, setIsDraggingOverMain] = React.useState(false);

const handleSlotStartDateTimeChange = (index, newDateTime) => {
    if (newDateTime) {
        handleWebinarSlotChange(index, 'date', newDateTime);
        handleWebinarSlotChange(index, 'startTime', newDateTime);
    } else {
        handleWebinarSlotChange(index, 'date', null);
        handleWebinarSlotChange(index, 'startTime', null);
        handleWebinarSlotChange(index, 'endTime', null);
    }
};

  const handleDragEvents = (setter) => ({
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setter(false); },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDrop: (e) => { 
          e.preventDefault(); 
          e.stopPropagation(); 
          setter(false);
          const inputName = e.currentTarget.dataset.inputName;
          if (inputName === 'sessionImages_upload' && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const imageFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                handleInputChange({ target: { name: 'sessionImages_new_file_multiple', type: 'file', files: imageFiles }});
            }
          } else if (inputName === 'courseMaterials' && e.dataTransfer.files && e.dataTransfer.files.length > 0) { // Keep existing for courseMaterials
            const pseudoEvent = {
              target: {
                name: inputName,
                type: 'file',
                files: e.dataTransfer.files,
              }
            };
            handleInputChange(pseudoEvent);
          }
        },
  });

  const handleGrantEarlyBirdChange = (checked) => {
    setGrantEarlyBird(checked);
    if (checked) {
      setIsPricingDetailsExpanded(true); 
    }
    if (!checked) {
      handleInputChange({ target: { name: 'earlyBirdDeadline', value: null } });
      handleInputChange({ target: { name: 'earlyBirdPrice', value: '' } });
    }
  };

  const getFileName = (fileOrMetadata) => {
    if (fileOrMetadata instanceof File) return fileOrMetadata.name;
    if (fileOrMetadata && typeof fileOrMetadata === 'object' && fileOrMetadata.name) return fileOrMetadata.name; 
    if (fileOrMetadata && typeof fileOrMetadata === 'string') { 
      try { const url = new URL(fileOrMetadata); return decodeURIComponent(url.pathname.split('/').pop()); }
      catch (e) { return fileOrMetadata; }
    }
    return t('managesessions:unknownFile');
  };

  const getFileSize = (fileOrMetadata) => {
    if (fileOrMetadata instanceof File) return fileOrMetadata.size;
    if (fileOrMetadata && typeof fileOrMetadata === 'object' && typeof fileOrMetadata.size === 'number') return fileOrMetadata.size;
    return null;
  };
  
  React.useEffect(() => {
    const hasEBData = !!(formData.earlyBirdPrice || formData.earlyBirdDeadline);
    setIsEarlyBirdGrantExpanded(hasEBData);
    if (hasEBData || errors.earlyBirdDeadline || errors.earlyBirdPrice) {
        setIsPricingDetailsExpanded(true);
    }
  }, [formData.earlyBirdPrice, formData.earlyBirdDeadline, errors.earlyBirdDeadline, errors.earlyBirdPrice]);

  const formatDateForDisplay = (dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    return date.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  
  const formatTimeForDisplay = (dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    return date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit'});
  };
  
 const formatDateTimeForDisplay = (dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    return date.toLocaleString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getUniqueIdentifier = (image) => {
    if (image) {
      return image._tempId || image.publicId || image._id;
    }
    return undefined; 
  };

  const handleImageDragStart = (e, image) => {
    const identifier = getUniqueIdentifier(image);
    setDraggedImageIdentifier(identifier);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleImageDragOver = (e, targetImage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetIdentifier = getUniqueIdentifier(targetImage);
    if (targetIdentifier === getUniqueIdentifier(formData.sessionImages.find(img => img.isMain))) {
        setIsDraggingOverMain(true);
    } else {
        setIsDraggingOverMain(false);
    }
  };

  const handleImageDragLeave = () => {
    setIsDraggingOverMain(false);
  };

  const handleImageDrop = (e, targetImage) => {
    e.preventDefault();
    setIsDraggingOverMain(false);
    const targetIdentifier = getUniqueIdentifier(targetImage);

    if (!draggedImageIdentifier || draggedImageIdentifier === targetIdentifier) {
      setDraggedImageIdentifier(null);
      return;
    }

    const newImages = [...formData.sessionImages];
    const draggedImageIndex = newImages.findIndex(img => getUniqueIdentifier(img) === draggedImageIdentifier);
    const targetImageIndex = newImages.findIndex(img => getUniqueIdentifier(img) === targetIdentifier);

    if (draggedImageIndex === -1 || targetImageIndex === -1) {
      setDraggedImageIdentifier(null);
      return;
    }
    
    const [draggedItem] = newImages.splice(draggedImageIndex, 1);
    newImages.splice(targetImageIndex, 0, draggedItem);
    
    handleInputChange({ target: { name: 'sessionImages_reordered', type: 'action', value: newImages } });
    setDraggedImageIdentifier(null);
  };

  const handleImageDragEnd = () => {
    setDraggedImageIdentifier(null);
    setIsDraggingOverMain(false);
  };

  if (isDisplayMode) {
    const languageOptions = { en: t('common:languages.en'), de: t('common:languages.de'), fr: t('common:languages.fr'), es: t('common:languages.es') };
    const platformOptions = { coachconnect: t('managesessions:coachconnectPlatform'), zoom: 'Zoom', googleMeet: 'Google Meet', microsoftTeams: 'Microsoft Teams', other: 'Other' };

    const renderSimplifiedPriceDisplay = () => {
      if (!formData || !formData.price) {
        return <DisplayField label={t('managesessions:pricing')} value={t('common:notConfigured')} icon={DollarSign} />;
      }

      const now = new Date();
      const currency = formData.currency || 'CHF';
      const ebPrice = formData.earlyBirdPrice ? parseFloat(formData.earlyBirdPrice) : null;
      const ebDeadlineString = formData.earlyBirdDeadline;
      let ebDeadlineDate = null;
      if (ebDeadlineString) {
        ebDeadlineDate = new Date(ebDeadlineString);
      }
      
      const isEbPriceNumberValid = ebPrice !== null && isFinite(ebPrice) && ebPrice > 0;
      const isEbDeadlineDateValid = ebDeadlineDate instanceof Date && !isNaN(ebDeadlineDate);
      const isEbCurrentlyActive = isEbPriceNumberValid && isEbDeadlineDateValid && now < ebDeadlineDate;

      if (isEbCurrentlyActive) {
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <DisplayField
              label={t('managesessions:earlyBirdPriceClientPaysClient')}
              icon={DollarSign}
            >
              <span>{`${currencySymbols[currency] || currency} ${ebPrice.toFixed(2)}`}</span>
            </DisplayField>
            <DisplayField
              label={t('managesessions:earlyBirdAvailableUntil')}
              value={formatDateTimeForDisplay(formData.earlyBirdDeadline)}
              icon={Clock}
            />
          </div>
        );
      }
      return null;
    };


    return (
      <div className="space-y-8">
        {renderSection === 'basic' && (
          <div className="space-y-6">
            <DisplayField label="" value={formData.title} icon={Edit} fullWidth className="text-xl font-bold !py-0"/>
 
            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><CalendarIcon size={18} /> {t('managesessions:schedule')}</h3>
              {formData.webinarSlots && formData.webinarSlots.length > 0 ? (
                <ul className="space-y-2">
                  {formData.webinarSlots.map((slot, index) => (
                    <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <strong className="font-semibold text-muted-foreground">{(formData.webinarSlots.length > 1 ? `${t('managesessions:dateLabel')} ${index + 1}`: t('managesessions:dateLabel'))}:</strong>
                      <span>{formatDateForDisplay(slot.date)}</span>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock size={14} />
                        <span>{formatTimeForDisplay(slot.startTime)} - {formatTimeForDisplay(slot.endTime)}</span>
                      </div>
                    </li>
                  ))}
               </ul>
              ) : (
                <DisplayField label={t('managesessions:schedule')} icon={CalendarIcon} />
              )}
            </div>
            
            <div className="border-t pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <DisplayField label={t('managesessions:webinarLanguage')} value={languageOptions[formData.webinarLanguage] || formData.webinarLanguage} icon={Globe} />
                    <DisplayField label={t('managesessions:minAttendees')} value={formData.minAttendees} icon={Users2} />
                    <DisplayField label={t('managesessions:maxAttendees')} value={formData.maxAttendees} icon={Users} />
                </div>
            </div>
            
             <div className="border-t pt-6">
              <div className="flex items-center justify-between gap-2 font-semibold text-lg mb-2">
                 <div className="flex items-center gap-2"><DollarSign size={18} /> {t('managesessions:pricing')}</div>
                {priceBreakdownData && typeof priceBreakdownData.clientPays === 'number' && (
                  <span className="text-base font-normal">
                    {`${currencySymbols[formData.currency] || formData.currency} ${priceBreakdownData.clientPays?.toFixed(2)}`}
                    {priceBreakdownData.vat?.amount > 0 && <small className="text-xs font-normal text-muted-foreground ml-1">{t('payments:vatIncluded')}</small>}
                  </span>
                )}
              </div>
              {renderSimplifiedPriceDisplay()}
            </div>
            
            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><MenuSquare size={18} /> {t('managesessions:webinarDescriptionAgenda')}</h3>
              <DisplayField icon={null} label="" fullWidth>
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.description?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
              </DisplayField>
            </div>

            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><LinkIcon size={18} /> {t('managesessions:connectionDetails')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <DisplayField label={t('managesessions:webinarPlatform')} value={platformOptions[formData.platform] || formData.platform} icon={Video} />
                <DisplayField label={t('managesessions:webinarLink')} icon={LinkIcon} >
                {formData.webinarLink ? (
                    <a href={formData.webinarLink.startsWith('http') ? formData.webinarLink : `https://${formData.webinarLink}`} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/90">
                    {formData.webinarLink}
                    </a>
                ) : (
                    <span className="italic text-muted-foreground">{t('common:notSet')}</span>
                )}
                </DisplayField>
              </div>
            </div>
          </div>
        )}

        {renderSection === 'advanced' && (
          <div className="space-y-6">
            <div className="border-t pt-6 first:border-t-0 first:pt-0">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><Info size={18} /> {t('managesessions:settings')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <DisplayField 
                    label={t('managesessions:setAsPrivateWebinarLabel')} 
                    value={formData.isPublic ? t('managesessions:publicState') : t('managesessions:privateState')} 
                    icon={formData.isPublic ? Eye : EyeOff} 
                />
                <DisplayField 
                    label={t('managesessions:listInPublicCatalogLabel')} 
                    value={formData.showInWebinarBrowser ? t('common:yes') : t('common:no')}
                    icon={formData.showInWebinarBrowser ? Users : UserX}
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><UploadCloud size={18} /> {t('managesessions:uploadCourseMaterials')}</h3>
              {formData.courseMaterials && formData.courseMaterials.length > 0 ? (
                <ul className="mt-2 space-y-2 max-w-md">
                  {formData.courseMaterials.map((material, index) => (
                    <li key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      <FileText size={16} className="text-muted-foreground" />
                      <span className="font-medium truncate">{getFileName(material)}</span>
                      {getFileSize(material) && (
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">({(getFileSize(material) / (1024 * 1024)).toFixed(2)} MB)</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="italic text-muted-foreground text-sm">{t('managesessions:noCourseMaterialsUploaded')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {renderSection === 'basic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
           <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">
              {t('managesessions:webinarTitle')}
              <span className="ml-1 text-destructive">*</span>
            </Label>
            <Input
              type="text"
              id="title"
              variant="compact"
              name="title" 
              value={formData.title || ''} 
              onChange={handleInputChange}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>} 
          </div>
      
            <div className="space-y-4 md:col-span-2">
                {formData.webinarSlots && formData.webinarSlots.map((slot, index) => (
                    <div key={index} className="flex flex-col sm:flex-row items-start sm:items-end gap-4 p-3 border rounded-md relative">
                       <div className="w-full sm:w-[15rem] space-y-1.5">
                            {index === 0 && <Label htmlFor={`webinarSlotDateTime_${index}`}>
                            {t('managesessions:startDateTimeLabel', 'Start')}
                            <span className="ml-1 text-destructive">*</span>
                        </Label>}
                            <DateTimePicker
                                value={slot.startTime ? new Date(slot.startTime) : null}
                                onChange={(date) => handleSlotStartDateTimeChange(index, date)}
                                fromDate={new Date()}
                            />
                            {(errors[`webinarSlot_date_${index}`] || errors[`webinarSlot_startTime_${index}`]) && (
                                <p className="text-sm text-destructive">
                                    {errors[`webinarSlot_date_${index}`] || errors[`webinarSlot_startTime_${index}`]}
                                </p>
                            )}
                        </div>
            
                       <div className="w-full sm:w-auto flex flex-col space-y-1.5">
                            {index === 0 && <Label>{t('managesessions:endTimeLabel')}</Label>}
                            <TimePicker
                                value={slot.endTime ? new Date(slot.endTime) : null}
                                onChange={(date) => handleWebinarSlotChange(index, 'endTime', date)}
                                baseDate={slot.date}
                            />
                            {errors[`webinarSlot_endTime_${index}`] && <p className="text-sm text-destructive">{errors[`webinarSlot_endTime_${index}`]}</p>}
                        </div>
                        
                        <div className="self-center sm:self-end">
                            {formData.webinarSlots.length > 1 && ( 
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveWebinarSlot(index)}
                                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                                    aria-label={t('managesessions:removeSlot')}
                                >
                                    <IconX size={18} />
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                {errors.webinarSlots && <p className="text-sm text-destructive">{errors.webinarSlots}</p>}
                <Button type="button" variant="outline" onClick={handleAddWebinarSlot}>
                    <PlusCircle size={16} className="mr-2" />
                    {t('managesessions:addDateSlotButtonText', 'Add Date Slot')}
                </Button>
            </div>
      
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-6">
                <div className="space-y-2">
                    <Label htmlFor="webinarLanguage">
                    {t('managesessions:webinarLanguage', 'Language')}
                    <span className="ml-1 text-destructive">*</span>
                  </Label>
                    <Select onValueChange={(value) => handleInputChange({ target: { name: 'webinarLanguage', value } })} value={formData.webinarLanguage || ''}>
                        <SelectTrigger id="webinarLanguage">
                            <SelectValue placeholder={t('common:selectPlaceholder', 'Select...')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en">{t('common:languages.en', 'English')}</SelectItem>
                            <SelectItem value="de">{t('common:languages.de', 'German')}</SelectItem>
                            <SelectItem value="fr">{t('common:languages.fr', 'French')}</SelectItem>
                            <SelectItem value="es">{t('common:languages.es', 'Spanish')}</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors.webinarLanguage && <p className="text-sm text-destructive">{errors.webinarLanguage}</p>}
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="minAttendees">{t('managesessions:minAttendees', 'Min. Participants')}</Label>
                    <Input
                        type="number"
                        id="minAttendees"
                        name="minAttendees"
                        variant="compact"
                        value={formData.minAttendees || ''}
                        onChange={handleInputChange}
                        min="0"
                        placeholder="0"
                    />
                    {errors.minAttendees && <p className="text-sm text-destructive">{errors.minAttendees}</p>}
                </div>
            
                <div className="space-y-2">
                    <Label htmlFor="maxAttendees">{t('managesessions:maxAttendees', 'Max. Participants')}</Label>
                    <Input
                        type="number"
                        id="maxAttendees"
                        name="maxAttendees"
                        variant="compact"
                        value={formData.maxAttendees || ''}
                        onChange={handleInputChange}
                        min="0"
                        placeholder="0"
                    />
                    {errors.maxAttendees && <p className="text-sm text-destructive">{errors.maxAttendees}</p>}
                </div>
            </div>
        
          <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div className="flex-1 min-w-[15rem] space-y-2">
                        <Label htmlFor="price">{t('managesessions:sessionPriceClientPays')}</Label>
                        <div className="flex items-center">
                            <Input
                                type="number"
                                id="price"
                                name="price"
                                value={formData.price || ''}
                                onChange={handleInputChange}
                                min="0"
                                step="0.01"
                                className="w-24"
                                placeholder="0.00"
                                position="left"
                            />
                            <Select value={formData.currency || 'CHF'} onValueChange={(value) => handleInputChange({ target: { name: 'currency', value } })}>
                                <SelectTrigger className="w-20" position="right" aria-label={t('managesessions:currency')}>
                                    <SelectValue>{currencySymbols[formData.currency] || formData.currency}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CHF">{t('common:currencies.CHF', 'CHF')}</SelectItem>
                                    <SelectItem value="EUR">{t('common:currencies.EUR', 'EUR')}</SelectItem>
                                    <SelectItem value="USD">{t('common:currencies.USD', 'USD')}</SelectItem>
                                    <SelectItem value="GBP">{t('common:currencies.GBP', 'GBP')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {errors.price && <p className="text-sm text-destructive mt-2">{errors.price}</p>}
                    </div>
                    
                    <div className="flex items-center gap-2 pb-1">
                        {isEarlyBirdFeatureEnabled && (
                            <div className="flex items-center space-x-2">
                                <Switch id="grantEarlyBird" name="grantEarlyBird" checked={grantEarlyBird} onCheckedChange={handleGrantEarlyBirdChange} />
                                <Label htmlFor="grantEarlyBird" className="font-normal text-sm whitespace-nowrap text-muted-foreground">{t('managesessions:grantEarlyBirdDiscount')}</Label>
                            </div>
                        )}
                        
                       <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setIsPricingDetailsExpanded(!isPricingDetailsExpanded)} aria-expanded={isPricingDetailsExpanded}>
                                        <ChevronDown size={20} className={cn("transition-transform duration-200", isPricingDetailsExpanded && "rotate-180")} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={5}><p>{t('managesessions:pricingDetails')}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
                {isPricingDetailsExpanded && (
                    <div className="pt-4 space-y-4">
                        {isEarlyBirdFeatureEnabled && grantEarlyBird && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg"> 
                                <div className="space-y-2">
                                    <Label htmlFor="earlyBirdDeadline">{t('managesessions:earlyBirdDeadline')}</Label>
                                    <DateTimePicker
                                        value={formData.earlyBirdDeadline ? new Date(formData.earlyBirdDeadline) : null}
                                        onChange={(date) => handleDateChange(date, 'earlyBirdDeadline')}
                                        fromDate={new Date()}
                                    />
                                    {errors.earlyBirdDeadline && <p className="text-sm text-destructive">{errors.earlyBirdDeadline}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="earlyBirdPrice">{t('managesessions:earlyBirdPriceClientPays')}</Label>
                                    <div className="flex items-center">
                                        <Input
                                            type="number" 
                                            id="earlyBirdPrice" 
                                            name="earlyBirdPrice"
                                            value={formData.earlyBirdPrice || ''} 
                                            onChange={handleInputChange}
                                            min="0" 
                                            step="0.01" 
                                            placeholder="0.00" 
                                            className="w-24"
                                            position="left"
                                        />
                                        <div className="flex items-center justify-center h-10 w-20 rounded-md rounded-l-none border border-l-0 border-input bg-background px-3 text-sm">
                                            {currencySymbols[formData.currency] || formData.currency}
                                        </div>
                                    </div>
                                    {errors.earlyBirdPrice && <p className="text-sm text-destructive">{errors.earlyBirdPrice}</p>}
                                </div>
                            </div>
                        )}
                     {((parseFloat(formData.price) >= 0 || parseFloat(formData.earlyBirdPrice) >= 0) && (priceBreakdownData || isLoadingPrice)) && (
                      <div className="p-4 bg-muted/50 dark:bg-muted/20 rounded-lg border border-border/50">
                          <EarningsBreakdown 
                              data={priceBreakdownData}
                              isLoading={isLoadingPrice}
                              currencySymbols={currencySymbols} 
                          />
                      </div>
                  )}
                    </div>
                )}
                   </div>
                
    
            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">{t('managesessions:webinarDescriptionAgenda')}</Label>
                <Textarea
                    id="description"
                    name="description" 
                    value={formData.description || ''} 
                    onChange={handleInputChange}
                    rows={4}
                    placeholder={t('managesessions:webinarDescriptionPlaceholder')}
                />
                {errors.description && <p className="text-sm text-destructive">{errors.description}</p>} 
            </div>
      
            <div className="space-y-2">
                <Label htmlFor="platform">{t('managesessions:webinarPlatform')}</Label>
                <Select value={formData.platform || 'coachconnect'} onValueChange={(value) => handleInputChange({ target: { name: 'platform', value } })}>
                    <SelectTrigger id="platform">
                        <SelectValue placeholder={t('managesessions:selectPlatform')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="coachconnect">{t('managesessions:coachconnectPlatform')}</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="googleMeet">Google Meet</SelectItem>
                        <SelectItem value="microsoftTeams">Microsoft Teams</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="webinarLink">{t('managesessions:webinarLink')}</Label>
                <Input
                    type="text"
                    id="webinarLink"
                    name="webinarLink"
                    variant="compact"
                    value={formData.webinarLink || ''}
                    onChange={handleInputChange}
                    placeholder={formData.platform === 'coachconnect' ? t('managesessions:webinarLinkAutoGenerated') : 'https://...'}
                    disabled={formData.platform === 'coachconnect'}
                />
                {errors.webinarLink && <p className="text-sm text-destructive">{errors.webinarLink}</p>}
            </div>
        </div>
      )}

      {renderSection === 'advanced' && (
        <div className="grid grid-cols-1 gap-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <Label htmlFor="setPrivateWebinar" className="text-base flex items-center gap-2">
                        {formData.isPublic ? <Eye size={16} /> : <EyeOff size={16} />}
                        {t('managesessions:setAsPrivateWebinarLabel')}
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"><Info size={14}/></Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={5}><p>{formData.isPublic ? t('managesessions:currentWebinarStatePublicInfo') : t('managesessions:currentWebinarStatePrivateInfo')}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </Label>
                </div>
                <Switch
                    id="setPrivateWebinar"
                    checked={!formData.isPublic}
                    onCheckedChange={(isNowSetToPrivate) => handleInputChange({ target: { name: 'isPublic', type: 'checkbox', checked: !isNowSetToPrivate } })}
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <Label htmlFor="showInWebinarBrowser" className="text-base flex items-center gap-2">
                        {formData.showInWebinarBrowser ? <Users size={16} /> : <UserX size={16} />}
                        {t('managesessions:listInPublicCatalogLabel')}
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"><Info size={14}/></Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={5}><p>{formData.showInWebinarBrowser ? t('managesessions:listInPublicCatalogTooltipEnabled') : t('managesessions:listInPublicCatalogTooltipDisabled')}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </Label>
                </div>
                <Switch
                    id="showInWebinarBrowser"
                    name="showInWebinarBrowser"
                    checked={formData.showInWebinarBrowser}
                    onCheckedChange={(checked) => handleInputChange({ target: { name: 'showInWebinarBrowser', type: 'checkbox', checked } })}
                />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sessionImageFile_input">{t('managesessions:uploadSessionImages')}</Label>
              <div 
                className={cn("mt-2 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors", isDraggingImages && "border-primary bg-primary/10")}
                {...handleDragEvents(setIsDraggingImages)}
                onClick={() => document.getElementById('sessionImageFile_input')?.click()}
                data-input-name="sessionImages_upload" 
              >
                <ImageIcon size={48} className="text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{t('managesessions:fileDragDropOr')} <span className="font-semibold text-primary">{t('managesessions:fileBrowse')}</span></p>
                <input type="file" id="sessionImageFile_input" name="sessionImages_new_file" multiple accept="image/*" onChange={handleInputChange} className="hidden"/>
              </div>
              {formData.sessionImages && formData.sessionImages.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {formData.sessionImages.map((image) => {
                    const uniqueId = getUniqueIdentifier(image);
                    return (
                      <div key={uniqueId} draggable onDragStart={(e) => handleImageDragStart(e, image)} onDragOver={(e) => handleImageDragOver(e, image)} onDrop={(e) => handleImageDrop(e, image)} onDragEnd={handleImageDragEnd} onDragLeave={handleImageDragLeave}
                        className={cn("relative aspect-video group", image.isMain && "ring-2 ring-primary ring-offset-2 rounded-md", draggedImageIdentifier === uniqueId && "opacity-50", isDraggingOverMain && getUniqueIdentifier(formData.sessionImages.find(img => img.isMain)) === uniqueId && "ring-2 ring-destructive")}>
                        <img src={image.previewUrl || image.url || ''} alt={`${t('managesessions:sessionImagePreview')}`} className="w-full h-full object-cover rounded-md"/>
                        <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button type="button" variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleInputChange({ target: { name: 'sessionImages_delete_id', type: 'action', value: image }})}>
                                    <Trash2 size={14} />
                                </Button>
                            </TooltipTrigger><TooltipContent><p>{t('managesessions:removeImage')}</p></TooltipContent></Tooltip></TooltipProvider>
                          {!image.isMain && (
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button type="button" variant="secondary" size="icon" className="h-7 w-7" onClick={() => handleInputChange({ target: { name: 'sessionImages_set_main_id', type: 'action', value: image }})}>
                                    <Star size={14} />
                                </Button>
                            </TooltipTrigger><TooltipContent><p>{t('managesessions:setAsTitleImageTooltip')}</p></TooltipContent></Tooltip></TooltipProvider>
                          )}
                        </div>
                        {image.isMain && (
                          <TooltipProvider><Tooltip><TooltipTrigger asChild>
                              <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-1.5"><Star size={12} fill="currentColor"/></div>
                          </TooltipTrigger><TooltipContent><p>{t('managesessions:currentTitleImageTooltip')}</p></TooltipContent></Tooltip></TooltipProvider>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('managesessions:sessionImagesHintMultiple')}</p>
              {errors.sessionImages && <p className="text-sm text-destructive">{errors.sessionImages}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="courseMaterialsFile">{t('managesessions:uploadCourseMaterials')}</Label>
              <div 
                className={cn("mt-2 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors", isDraggingMaterials && "border-primary bg-primary/10")}
                {...handleDragEvents(setIsDraggingMaterials)}
                onClick={() => document.getElementById('courseMaterialsFile')?.click()}
                data-input-name="courseMaterials"
              >
                <UploadCloud size={32} className="text-muted-foreground" />
                 <p className="mt-2 text-sm text-muted-foreground">{t('managesessions:fileDragDropOr')} <span className="font-semibold text-primary">{t('managesessions:fileBrowseMultiple')}</span></p>
                <input type="file" id="courseMaterialsFile" name="courseMaterials" multiple onChange={handleInputChange} className="hidden" />
              </div>
              <p className="text-xs text-muted-foreground">{t('managesessions:courseMaterialsHint')}</p>
              {formData.courseMaterials && formData.courseMaterials.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {formData.courseMaterials.map((material, index) => (
                    <li key={material._tempId || material._id || index} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" /> 
                      <span className="flex-1 truncate">{getFileName(material)}</span>
                      {getFileSize(material.file || material) && (<span className="text-xs text-muted-foreground whitespace-nowrap"> ({(getFileSize(material.file || material) / (1024 * 1024)).toFixed(2)} MB)</span>)}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => handleRemoveCourseMaterial(material._tempId || material._id?.toString() || material.publicId)}>
                        <Trash2 size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {errors.courseMaterials && <p className="text-sm text-destructive">{errors.courseMaterials}</p>}
            </div>
        </div>
      )}
    </>
  );
};

WebinarSessionForm.propTypes = {
  formData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
  currencySymbols: PropTypes.object.isRequired,
  handleDateChange: PropTypes.func.isRequired,
  coachSettings: PropTypes.object.isRequired,
  priceRelatedData: PropTypes.shape({
    isLoadingPrice: PropTypes.bool,
    clientPaysTotal: PropTypes.number,
    coachVatRatePercent: PropTypes.number,
    coachPlatformFeePercent: PropTypes.number,
    coachReceives: PropTypes.number,
    actualPlatformFeeAmount: PropTypes.number,
    actualVatAmount: PropTypes.number,
    earlyBirdClientPaysTotal: PropTypes.number,
    earlyBirdCoachReceives: PropTypes.number,
    earlyBirdActualPlatformFeeAmount: PropTypes.number,
    earlyBirdActualVatAmount: PropTypes.number,
  }),
  sessionTypeData: PropTypes.array,
  handleAddWebinarSlot: PropTypes.func.isRequired, 
  handleRemoveWebinarSlot: PropTypes.func.isRequired, 
  handleWebinarSlotChange: PropTypes.func.isRequired, 
  handleRemoveCourseMaterial: PropTypes.func.isRequired,
  renderSection: PropTypes.oneOf(['basic', 'advanced']),
  bookingData: PropTypes.object,
  isDisplayMode: PropTypes.bool, 
};

export default WebinarSessionForm;