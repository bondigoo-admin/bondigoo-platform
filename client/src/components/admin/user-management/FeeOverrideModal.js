
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateFeeOverride } from '../../../hooks/useAdmin';
import { useDraggableDialog } from '../../../hooks/useDraggableDialog'; // Assuming the hook is placed here
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { enUS } from 'date-fns/locale/en-US';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog.tsx';
import { Button } from '../../ui/button.tsx';
import { Label } from '../../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Input } from '../../ui/input.tsx';
import { Checkbox } from '../../ui/checkbox.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Calendar } from '../../ui/calendar.jsx';
import { Textarea } from '../../ui/textarea.tsx';

const SCOPES = ['ALL', 'SCHEDULED_SESSIONS', 'LIVE_SESSIONS', 'PROGRAMS'];

const locales = {
  de: de,
  en: enUS,
};

const FeeOverrideModal = ({ isOpen, onClose, user }) => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [type, setType] = useState('ZERO_FEE');
  const [discountPercentage, setDiscountPercentage] = useState(50);
  const [appliesTo, setAppliesTo] = useState(['ALL']);
  const [effectiveUntil, setEffectiveUntil] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');

  const dialogContentRef = useRef(null);
  const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(dialogContentRef);

  const updateFeeMutation = useUpdateFeeOverride();
  const coachProfile = user?.coachProfile;
  const currentLocale = locales[i18n.language] || enUS;

  useEffect(() => {
    if (isOpen && coachProfile?.settings?.platformFeeOverride) {
      const override = coachProfile.settings.platformFeeOverride;
      setType(override.type);
      setDiscountPercentage(override.discountPercentage || 50);
      setAppliesTo(override.appliesTo || ['ALL']);
      setEffectiveUntil(override.effectiveUntil ? new Date(override.effectiveUntil) : null);
      setAdminNotes(override.adminNotes || '');
    } else {
      setType('ZERO_FEE');
      setDiscountPercentage(50);
      setAppliesTo(['ALL']);
      setEffectiveUntil(null);
      setAdminNotes('');
    }
  }, [isOpen, coachProfile]);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        resetDialogPosition();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, resetDialogPosition]);

  const handleScopeChange = (scope, checked) => {
    if (scope === 'ALL') {
      setAppliesTo(checked ? ['ALL'] : []);
    } else {
      setAppliesTo(prev => {
        const newScopes = checked ? [...prev, scope] : prev.filter(s => s !== scope);
        return newScopes.filter(s => s !== 'ALL');
      });
    }
  };

  const handleSave = async () => {
    const payload = {
      type,
      discountPercentage: type === 'PERCENTAGE_DISCOUNT' ? Number(discountPercentage) : undefined,
      appliesTo: appliesTo.length > 0 ? appliesTo : ['ALL'],
      effectiveUntil,
      adminNotes,
    };
    
    await toast.promise(
      updateFeeMutation.mutateAsync({ userId: user._id, overrideData: payload }),
      {
        loading: t('common:saving'),
        success: t('userManagement.actions.feeOverrideSuccess'),
        error: (err) => err.response?.data?.message || t('common:error.generic'),
      }
    );
    onClose();
  };

  const handleRemove = async () => {
    await toast.promise(
      updateFeeMutation.mutateAsync({ userId: user._id, overrideData: {} }), // Send empty object
      {
        loading: t('common:removing'),
        success: t('userManagement.actions.feeOverrideRemoveSuccess'),
        error: (err) => err.response?.data?.message || t('common:error.generic'),
      }
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent ref={dialogContentRef} className="sm:max-w-[600px] dark:bg-zinc-900">
        {/* The onMouseDown listener is REMOVED from the header */}
        <DialogHeader>
          {/* The onMouseDown listener and cursor class are MOVED to the title */}
          <DialogTitle onMouseDown={handleMouseDownOnTitle} className="cursor-move">
            {t('userManagement.feeOverride.title')}
          </DialogTitle>
          <DialogDescription>
            {t('userManagement.feeOverride.description')} {user?.firstName} {user?.lastName}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">{t('userManagement.feeOverride.type')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ZERO_FEE">{t('userManagement.feeOverride.types.zero')}</SelectItem>
                <SelectItem value="PERCENTAGE_DISCOUNT">{t('userManagement.feeOverride.types.discount')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'PERCENTAGE_DISCOUNT' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="discount" className="text-right">{t('userManagement.feeOverride.discount')}</Label>
              <Input
                id="discount"
                type="number"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(e.target.value)}
                className="col-span-3"
                min="1"
                max="99"
              />
            </div>
          )}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">{t('userManagement.feeOverride.appliesTo')}</Label>
            <div className="col-span-3 space-y-2">
              {SCOPES.map(scope => (
                <div key={scope} className="flex items-center space-x-2">
                  <Checkbox
                    id={`scope-${scope}`}
                    checked={appliesTo.includes(scope)}
                    onCheckedChange={(checked) => handleScopeChange(scope, checked)}
                    disabled={scope !== 'ALL' && appliesTo.includes('ALL')}
                  />
                  <label htmlFor={`scope-${scope}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {t(`userManagement.feeOverride.scopes.${scope.toLowerCase()}`)}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('userManagement.feeOverride.expires')}</Label>
            {/* --- FIX IS HERE --- */}
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="col-span-3 justify-start text-left font-normal dark:bg-zinc-800 dark:hover:bg-zinc-700">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {effectiveUntil ? format(effectiveUntil, 'PPP', { locale: currentLocale }) : <span>{t('userManagement.feeOverride.noExpiry')}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 flex flex-col">
                <Calendar 
                  mode="single" 
                  selected={effectiveUntil} 
                  onSelect={setEffectiveUntil} 
                  initialFocus 
                  locale={currentLocale}
                />
                <Button variant="ghost" size="sm" onClick={() => setEffectiveUntil(null)}>{t('common:clear')}</Button>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="notes" className="text-right pt-2">{t('userManagement.feeOverride.notes')}</Label>
            <Textarea
              id="notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="col-span-3 dark:bg-zinc-800 dark:placeholder:text-zinc-400"
              placeholder={t('userManagement.feeOverride.notesPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button 
            variant="destructive" 
            onClick={handleRemove} 
            disabled={!coachProfile?.settings?.platformFeeOverride || updateFeeMutation.isLoading}
          >
            {t('userManagement.feeOverride.removeOverride')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
            <Button onClick={handleSave} disabled={updateFeeMutation.isLoading}>{t('common:save')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeeOverrideModal;