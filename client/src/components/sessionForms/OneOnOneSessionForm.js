import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { 
    Calendar, ChevronDown, Clock, User, DollarSign, Edit, Info, Link as LinkIcon, 
    Eye, EyeOff, FileText, Trash2, UploadCloud, Users, Target, Notebook, ClipboardCheck, ListChecks, ImageIcon, MenuSquare
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

registerLocale('de', de);

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

const OneOnOneSessionForm = ({
  formData,
  handleInputChange,
  errors,
  currencySymbols,
  handleDateChange,
  priceRelatedData,
  renderSection = 'basic',
  isDisplayMode = false,
  handleRemoveCourseMaterial,
}) => {
  const { t, i18n } = useTranslation(['common', 'managesessions', 'payments']);
  const [isDraggingMaterials, setIsDraggingMaterials] = React.useState(false);
  const [isDraggingImage, setIsDraggingImage] = React.useState(false);
  const [isPricingDetailsExpanded, setIsPricingDetailsExpanded] = React.useState(false);

  const {
    isLoadingPrice,
    clientPaysTotal,
    coachVatRatePercent,
    coachPlatformFeePercent,
    coachReceives,
    actualPlatformFeeAmount,
    actualVatAmount,
  } = priceRelatedData || {};

  const handleDragEvents = (setter, inputName) => ({
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setter(false); },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDrop: (e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        setter(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const pseudoEvent = { target: { name: inputName, type: 'file', files } };
            handleInputChange(pseudoEvent);
        }
    },
  });

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

  const formatDateTimeForDisplay = (dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    return date.toLocaleString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
if (isDisplayMode) {
    const singleImage = formData.sessionImages && formData.sessionImages.length > 0 ? formData.sessionImages[0] : null;
    return (
      <div className="space-y-8">
        {renderSection === 'basic' && (
          <div className="space-y-6">
            <DisplayField label="" value={formData.title} icon={Edit} fullWidth className="text-xl font-bold !py-0"/>

            <div className="border-t pt-6">
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><User size={18} /> {t('managesessions:clientInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <DisplayField label={t('managesessions:client')} icon={User}>
                        {formData.user?.name || t('common:notAssigned')}
                    </DisplayField>
                </div>
            </div>
            
            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><Calendar size={18} /> {t('managesessions:schedule')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  <DisplayField label={t('managesessions:sessionDateTime')} value={formatDateTimeForDisplay(formData.start)} icon={Calendar} />
                  <DisplayField label={t('managesessions:sessionDuration')} value={`${formData.duration || 'N/A'} ${t('common:minutes_short')}`} icon={Clock} />
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between gap-2 font-semibold text-lg mb-2">
                <div className="flex items-center gap-2"><DollarSign size={18} /> {t('managesessions:pricing')}</div>
                 {priceRelatedData && typeof clientPaysTotal === 'number' && (
                  <span className="text-base font-normal">
                    {`${currencySymbols[formData.currency] || formData.currency} ${clientPaysTotal?.toFixed(2)}`}
                    {coachVatRatePercent > 0 && <small className="text-xs font-normal text-muted-foreground ml-1">{t('payments:vatIncluded')}</small>}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><MenuSquare size={18} /> {t('managesessions:sessionDescription')}</h3>
              <DisplayField icon={null} label="" fullWidth>
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.description?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
              </DisplayField>
            </div>
          </div>
        )}

        {renderSection === 'advanced' && (
           <div className="space-y-6">
                <div className="border-t pt-6 first:border-t-0 first:pt-0">
                    <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><Info size={18} /> {t('managesessions:settings')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <DisplayField 
                            label={t('managesessions:sessionVisibility')} 
                            value={formData.isPublic ? t('managesessions:publicState') : t('managesessions:privateState')} 
                            icon={formData.isPublic ? Eye : EyeOff} 
                        />
                    </div>
                </div>
                 <div className="border-t pt-6">
                    <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><LinkIcon size={18} /> {t('managesessions:connectionDetails')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <DisplayField label={t('managesessions:sessionPlatform')} value={formData.platform || 'Coach Connect Platform'} icon={Users} />
                        <DisplayField label={t('managesessions:sessionLink')} icon={LinkIcon} >
                        {formData.sessionLink ? (
                            <a href={formData.sessionLink.startsWith('http') ? formData.sessionLink : `https://${formData.sessionLink}`} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/90">
                            {formData.sessionLink}
                            </a>
                        ) : (
                            <span className="italic text-muted-foreground">{t('common:notSet')}</span>
                        )}
                        </DisplayField>
                    </div>
                </div>

                <div className="border-t pt-6">
                    <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><ListChecks size={18} /> {t('managesessions:coachingDetails')}</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <DisplayField label={t('managesessions:sessionGoal')} icon={Target} fullWidth>
                            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.sessionGoal?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
                        </DisplayField>
                        <DisplayField label={t('managesessions:clientNotes')} icon={Notebook} fullWidth>
                            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.clientNotes?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
                        </DisplayField>
                        <DisplayField label={t('managesessions:preparationRequired')} icon={ClipboardCheck} fullWidth>
                            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.preparationRequired?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
                        </DisplayField>
                        <DisplayField label={t('managesessions:followUpTasks')} icon={ClipboardCheck} fullWidth>
                            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: formData.followUpTasks?.replace(/\n/g, '<br />') || `<span class="italic text-muted-foreground">${t('common:notSet')}</span>` }}></div>
                        </DisplayField>
                    </div>
                </div>

                {singleImage && (
                    <div className="border-t pt-6">
                        <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><ImageIcon size={18} /> {t('managesessions:sessionImage')}</h3>
                        <div className="mt-2">
                            <img src={singleImage.url || singleImage.previewUrl} alt={t('managesessions:sessionImage')} className="rounded-lg object-cover w-full aspect-video max-w-md" />
                        </div>
                    </div>
                )}
                
                <div className="border-t pt-6">
                    <h3 className="flex items-center gap-2 font-semibold text-lg mb-2"><UploadCloud size={18} /> {t('managesessions:sessionMaterials')}</h3>
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

  const singleImage = formData.sessionImages && formData.sessionImages.length > 0 ? formData.sessionImages[0] : null;
  return (
    <>
      {renderSection === 'basic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">{t('managesessions:sessionTitle')}</Label>
                <Input
                    type="text"
                    id="title"
                    name="title"
                    variant="compact"
                    value={formData.title || ''}
                    onChange={handleInputChange}
                    placeholder={t('managesessions:sessionTitlePlaceholder')}
                />
                {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
            </div>

            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-6">
                <div className="space-y-2">
                    <Label htmlFor="sessionDate">{t('managesessions:dateLabel')}</Label>
                    <div className="relative">
                        <DatePicker
                            selected={formData.start ? new Date(formData.start) : null}
                            onChange={(date) => {
                                const newStart = new Date(formData.start || new Date());
                                if(date) {
                                    newStart.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                                }
                                const newEnd = new Date(formData.end || newStart.getTime() + 60 * 60 * 1000);
                                if(date) {
                                    newEnd.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                                }
                                
                                handleInputChange({ target: { name: 'start', value: newStart } });
                                handleInputChange({ target: { name: 'end', value: newEnd } });
                            }}
                            dateFormat={i18n.language === 'de' ? "dd.MM.yyyy" : "MM/dd/yyyy"}
                            locale={i18n.language}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            wrapperClassName="w-full"
                            id="sessionDate"
                            popperPlacement="bottom-start"
                            minDate={new Date()}
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    {errors.start && <p className="text-sm text-destructive">{errors.start}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="sessionStartTime">{t('managesessions:startTimeLabel')}</Label>
                    <div className="relative">
                        <DatePicker
                            selected={formData.start ? new Date(formData.start) : null}
                            onChange={(time) => {
                                if (!time) return;
                                const newStart = new Date(formData.start || new Date());
                                newStart.setHours(time.getHours(), time.getMinutes());

                                let newEnd = new Date(formData.end || newStart);
                                if (newStart.getTime() >= newEnd.getTime()) {
                                    newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
                                }

                                handleInputChange({ target: { name: 'start', value: newStart } });
                                handleInputChange({ target: { name: 'end', value: newEnd } });
                            }}
                            showTimeSelect
                            showTimeSelectOnly
                            timeIntervals={15}
                            timeCaption={t('common:time')}
                            dateFormat="HH:mm"
                            locale={i18n.language}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            wrapperClassName="w-full"
                            id="sessionStartTime"
                            popperPlacement="bottom-start"
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="sessionEndTime">{t('managesessions:endTimeLabel')}</Label>
                    <div className="relative">
                        <DatePicker
                            selected={formData.end ? new Date(formData.end) : null}
                            onChange={(time) => {
                                if(!time) return;
                                const newEnd = new Date(formData.end || new Date());
                                const startDate = new Date(formData.start || new Date());
                                newEnd.setFullYear(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                                newEnd.setHours(time.getHours(), time.getMinutes());
                                handleInputChange({ target: { name: 'end', value: newEnd } });
                            }}
                            showTimeSelect
                            showTimeSelectOnly
                            timeIntervals={15}
                            timeCaption={t('common:time')}
                            dateFormat="HH:mm"
                            locale={i18n.language}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            wrapperClassName="w-full"
                            id="sessionEndTime"
                            popperPlacement="bottom-start"
                            minTime={formData.start ? new Date(new Date(formData.start).getTime() + 15 * 60000) : undefined} 
                            maxTime={formData.start ? new Date(new Date(formData.start).setHours(23, 45, 0, 0)) : undefined}
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    {errors.end && <p className="text-sm text-destructive">{errors.end}</p>}
                </div>
            </div>

            <div className="space-y-2 md:col-span-2">
                <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="price">{t('managesessions:sessionPriceClientPays')}</Label>
                        <div className="flex">
                            <Select
                                value={formData.currency || 'CHF'}
                                onValueChange={(value) => handleInputChange({ target: { name: 'currency', value } })}
                                name="currency"
                            >
                                <SelectTrigger className="w-24 rounded-r-none focus:ring-0 focus:ring-offset-0" aria-label="Currency">
                                    <SelectValue>{currencySymbols[formData.currency] || formData.currency}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CHF">CHF</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="GBP">GBP</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                type="number"
                                id="price"
                                name="price"
                                variant="compact"
                                value={formData.price || ''}
                                onChange={handleInputChange}
                                min="0"
                                step="0.01"
                                className="rounded-l-none"
                                placeholder="0.00"
                            />
                        </div>
                        {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
                    </div>
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mt-8 shrink-0 data-[state=open]:bg-accent"
                                    onClick={() => setIsPricingDetailsExpanded(!isPricingDetailsExpanded)}
                                    aria-expanded={isPricingDetailsExpanded}
                                >
                                    <ChevronDown size={20} className={cn("transition-transform duration-200", isPricingDetailsExpanded && "rotate-180")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={5}>
                                <p>{t('managesessions:pricingDetails')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                {isPricingDetailsExpanded && (
                    <div className="pt-4">
                    {(formData.price !== '' && parseFloat(formData.price) >= 0 && priceRelatedData) && (
                        <div className="p-4 bg-muted rounded-lg border">
                        {isLoadingPrice ? (<p>{t('managesessions:loadingPrice')}</p>) : (
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">{t('payments:basePrice')}</span>
                                    <span>{currencySymbols[formData.currency]} {coachReceives?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">{t('payments:platformFee')} ({coachPlatformFeePercent}%)</span>
                                    <span>+ {currencySymbols[formData.currency]} {actualPlatformFeeAmount?.toFixed(2)}</span>
                                </div>
                                {coachVatRatePercent > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t('payments:vat')} ({coachVatRatePercent}%)</span>
                                        <span>+ {currencySymbols[formData.currency]} {actualVatAmount?.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center font-semibold border-t pt-2 mt-2">
                                    <span>{t('payments:total')}</span>
                                    <span>
                                        {currencySymbols[formData.currency]} {clientPaysTotal?.toFixed(2)}
                                        {coachVatRatePercent > 0 && <small className="text-xs font-normal text-muted-foreground ml-1">{t('payments:vatIncluded')}</small>}
                                    </span>
                                </div>
                            </div>
                        )}
                        </div>
                    )}
                    </div>
                )}
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">{t('managesessions:sessionDescription')}</Label>
                <Textarea
                    id="description"
                    name="description" 
                    value={formData.description || ''} 
                    onChange={handleInputChange}
                    rows={4}
                    placeholder={t('managesessions:sessionDescriptionPlaceholder')}
                />
                {errors.description && <p className="text-sm text-destructive">{errors.description}</p>} 
            </div>
        </div>
      )}
      
      {renderSection === 'advanced' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4 md:col-span-2">
                <div className="space-y-0.5">
                    <Label htmlFor="isPublic" className="text-base flex items-center gap-2">
                        {formData.isPublic ? <Eye size={16} /> : <EyeOff size={16} />}
                        {t('managesessions:setAsPublicSession')}
                        <TooltipProvider delayDuration={100}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5"><Info size={14}/></Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={5}><p>{t('managesessions:setAsPublicSessionTooltip')}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </Label>
                </div>
                <Switch id="isPublic" name="isPublic" checked={formData.isPublic} onCheckedChange={(checked) => handleInputChange({ target: { name: 'isPublic', type: 'checkbox', checked } })} />
            </div>

            <div className="space-y-2">
                <Label htmlFor="platform">{t('managesessions:sessionPlatform')}</Label>
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
                <Label htmlFor="sessionLink">{t('managesessions:sessionLink')}</Label>
                <Input
                    type="text" id="sessionLink" name="sessionLink" variant="compact"
                    value={formData.sessionLink || ''} onChange={handleInputChange}
                    placeholder={formData.platform === 'coachconnect' ? t('managesessions:webinarLinkAutoGenerated') : 'https://...'}
                    disabled={formData.platform === 'coachconnect'}
                />
                {errors.sessionLink && <p className="text-sm text-destructive">{errors.sessionLink}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sessionGoal">{t('managesessions:sessionGoal')}</Label>
                <Textarea id="sessionGoal" name="sessionGoal" value={formData.sessionGoal || ''} onChange={handleInputChange} rows={3}/>
                {errors.sessionGoal && <p className="text-sm text-destructive">{errors.sessionGoal}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="clientNotes">{t('managesessions:clientNotes')}</Label>
                <Textarea id="clientNotes" name="clientNotes" value={formData.clientNotes || ''} onChange={handleInputChange} rows={3}/>
                {errors.clientNotes && <p className="text-sm text-destructive">{errors.clientNotes}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="preparationRequired">{t('managesessions:preparationRequired')}</Label>
                <Textarea id="preparationRequired" name="preparationRequired" value={formData.preparationRequired || ''} onChange={handleInputChange} rows={3}/>
                {errors.preparationRequired && <p className="text-sm text-destructive">{errors.preparationRequired}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="followUpTasks">{t('managesessions:followUpTasks')}</Label>
                <Textarea id="followUpTasks" name="followUpTasks" value={formData.followUpTasks || ''} onChange={handleInputChange} rows={3}/>
                {errors.followUpTasks && <p className="text-sm text-destructive">{errors.followUpTasks}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sessionImageFile">{t('managesessions:uploadSessionImage')}</Label>
              <div 
                className={cn("mt-2 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors", isDraggingImage && "border-primary bg-primary/10")}
                {...handleDragEvents(setIsDraggingImage, 'sessionImages_new_file')}
                onClick={() => document.getElementById('sessionImageFile')?.click()}
              >
                <ImageIcon size={48} className="text-muted-foreground" />
                 <p className="mt-2 text-sm text-muted-foreground">{t('managesessions:fileDragDropOr')} <span className="font-semibold text-primary">{t('managesessions:fileBrowse')}</span></p>
                <input type="file" id="sessionImageFile" name="sessionImages_new_file" onChange={handleInputChange} className="hidden" accept="image/*" />
              </div>
              {singleImage && (
                 <div className="mt-4 grid grid-cols-1 gap-4">
                    <div className="relative aspect-video">
                        <img src={singleImage.previewUrl || singleImage.url} alt="Preview" className="w-full h-full object-cover rounded-md"/>
                        <div className="absolute top-2 right-2 flex gap-2">
                            <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleInputChange({target: {name: 'sessionImages_delete_id', type: 'action', value: singleImage}})}>
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    </div>
                </div>
              )}
              {errors.sessionImages && <p className="text-sm text-destructive">{errors.sessionImages}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="courseMaterialsFile">{t('managesessions:uploadSessionMaterials')}</Label>
              <div 
                className={cn("mt-2 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors", isDraggingMaterials && "border-primary bg-primary/10")}
                {...handleDragEvents(setIsDraggingMaterials, 'courseMaterials')}
                onClick={() => document.getElementById('courseMaterialsFile')?.click()}
              >
                <UploadCloud size={32} className="text-muted-foreground" />
                 <p className="mt-2 text-sm text-muted-foreground">{t('managesessions:fileDragDropOr')} <span className="font-semibold text-primary">{t('managesessions:fileBrowseMultiple')}</span></p>
                <input type="file" id="courseMaterialsFile" name="courseMaterials" multiple onChange={handleInputChange} className="hidden" />
              </div>
              {formData.courseMaterials && formData.courseMaterials.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {formData.courseMaterials.map((material, index) => (
                    <li key={material._tempId || material._id || index} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" /> 
                      <span className="flex-1 truncate">{getFileName(material)}</span>
                      {getFileSize(material.file || material) && (<span className="text-xs text-muted-foreground whitespace-nowrap"> ({(getFileSize(material.file || material) / (1024 * 1024)).toFixed(2)} MB)</span>)}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveCourseMaterial(material._tempId || material._id?.toString() || material.publicId)}>
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

OneOnOneSessionForm.propTypes = {
  formData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
  currencySymbols: PropTypes.object.isRequired,
  handleDateChange: PropTypes.func.isRequired,
  priceRelatedData: PropTypes.object,
  renderSection: PropTypes.oneOf(['basic', 'advanced']),
  isDisplayMode: PropTypes.bool,
  handleRemoveCourseMaterial: PropTypes.func.isRequired,
};

export default OneOnOneSessionForm;