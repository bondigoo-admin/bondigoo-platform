import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.tsx';
import { Loader2, Tag, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { validateDiscountForPrice } from '../services/discountAPI';

const LIVE_SESSION_ENTITY_ID = '66ec54ee4a8965b22af33fd1';

const LiveSessionClientRequestModal = ({ isOpen, onClose, coach, onConfirmRequest }) => {
  // DIAGNOSTIC LOG 1: Log props on every render of the modal.
  logger.debug('[DIAGNOSTIC] LiveSessionClientRequestModal RENDER', {
    isOpen,
    coachProp: coach ? { ...coach, user: coach.user ? { ...coach.user } : null } : null, // Deep copy for logging
    hasOnConfirmRequest: !!onConfirmRequest,
  });

  const { t } = useTranslation(['liveSession', 'common', 'bookings', 'coachprofile']);

  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [effectiveRate, setEffectiveRate] = useState(coach?.liveSessionRate);
  const [isApplying, setIsApplying] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    // DIAGNOSTIC LOG 2: Log props specifically when the modal opens.
    if (isOpen) {
      logger.debug('[DIAGNOSTIC] LiveSessionClientRequestModal useEffect[isOpen]', {
        coachPropOnOpen: coach ? { ...coach, user: coach.user ? { ...coach.user } : null } : null
      });
      setDiscountCode('');
      setAppliedDiscount(null);
      setEffectiveRate(coach?.liveSessionRate);
      setValidationError('');
      setIsSending(false);
    }
  }, [isOpen, coach]);

  const handleApplyDiscount = async () => {
    if (!discountCode || !coach) return;
    setIsApplying(true);
    setValidationError('');
    try {
      const result = await validateDiscountForPrice({
        entityType: 'session',
        entityId: LIVE_SESSION_ENTITY_ID,
        coachId: coach.user._id,
        code: discountCode,
        currentPrice: coach.liveSessionRate.amount,
      });

      setEffectiveRate({ amount: result.finalPrice, currency: coach.liveSessionRate.currency });
      setAppliedDiscount(result.discountApplied);
      setDiscountCode('');
    } catch (error) {
      logger.error('LiveSessionClientRequestModal: Discount application failed.', { error });
      const errorData = error;
      let i18nKey = 'bookings:errors.invalidOrExpiredCode';
      let i18nParams = {};
       if (errorData?.code) {
        switch (errorData.code) {
          case 'DISCOUNT_NOT_ACTIVE_YET': i18nKey = 'bookings:errors.discountNotActiveYet'; break;
          case 'DISCOUNT_EXPIRED': i18nKey = 'bookings:errors.discountExpired'; break;
          case 'USAGE_LIMIT_REACHED': i18nKey = 'bookings:errors.discountUsageLimitReached'; break;
          case 'MINIMUM_PURCHASE_NOT_MET':
            i18nKey = 'bookings:errors.discountMinPurchaseRequired';
            i18nParams = { amount: errorData.details.amount, currency: errorData.details.currency };
            break;
          case 'LOGIN_REQUIRED': i18nKey = 'bookings:errors.discountLoginRequired'; break;
          case 'ALREADY_USED': i18nKey = 'bookings:errors.discountAlreadyUsed'; break;
          case 'NOT_ELIGIBLE': i18nKey = 'bookings:errors.discountNotEligible'; break;
          case 'NOT_APPLICABLE_TO_ITEM': i18nKey = 'bookings:errors.discountNotApplicableToItem'; break;
          case 'INVALID_OR_EXPIRED_CODE': i18nKey = 'bookings:errors.invalidOrExpiredCode'; break;
          case 'AUTOMATIC_DISCOUNT': i18nKey = 'bookings:errors.automaticDiscount'; break;
          default: break;
        }
      }
      const message = t(i18nKey, i18nParams);
      setValidationError(message);
      setAppliedDiscount(null);
      setEffectiveRate(coach.liveSessionRate);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setEffectiveRate(coach.liveSessionRate);
    setDiscountCode('');
    setValidationError('');
  };

const handleSendRequest = async () => {
    // DIAGNOSTIC LOG 3: Log the state of `coach` right before the check.
    logger.debug('[DIAGNOSTIC] handleSendRequest: PRE-CHECK', {
      coachPropInsideHandler: coach ? { ...coach, user: coach.user ? { ...coach.user } : null } : null,
      'coach.user exists': !!coach?.user,
      'coach.user._id exists': !!coach?.user?._id
    });

    if (!coach?.user?._id) {
      toast.error(t('common:errors.unexpectedError', 'An unexpected error occurred. Coach data is incomplete.'));
      logger.error('LiveSessionClientRequestModal: Attempted to send request but coach.user._id is missing.', { coach });
      onClose();
      return;
    }

    const payload = {
      coachId: coach.user._id,
      appliedDiscount: appliedDiscount ? {
          _id: appliedDiscount._id,
          code: appliedDiscount.code
      } : undefined
    };

    // DIAGNOSTIC LOG 4: Log the exact payload being sent up.
    logger.debug('[DIAGNOSTIC] handleSendRequest: PAYLOAD READY', { payload });

    setIsSending(true);
    try {
      await onConfirmRequest(payload);
      onClose(); 
    } catch (error) {
      toast.error(t('requestFailed', 'Failed to send request. Please try again.'));
      logger.error('Failed to send live session request', error);
      setIsSending(false);
    }
  };

  if (!coach || !coach.liveSessionRate) return null;

  const baseRate = coach.liveSessionRate;
  
  // DIAGNOSTIC LOG 5: Check for a null user object before rendering, which can cause silent crashes.
  if (!coach.user) {
    logger.error('[DIAGNOSTIC] LiveSessionClientRequestModal: CRITICAL - Rendering with null coach.user object. This will crash.', { coach });
    return null; // Prevent render crash
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t('coachprofile:requestLiveSession')}</DialogTitle>
          <DialogDescription>{t('requestModalDescription', 'Confirm details to start a live session.')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={coach.profilePicture?.url} />
            <AvatarFallback>{coach.user.firstName?.[0]}{coach.user.lastName?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-bold text-lg">{coach.user.firstName} {coach.user.lastName}</p>
            <p className="text-muted-foreground">{coach.headline}</p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold text-lg">{t('priceDetails', { ns: 'common' })}</h3>
          {!appliedDiscount ? (
             <div className="text-3xl font-bold text-center">
              {effectiveRate.amount.toFixed(2)} {effectiveRate.currency} <span className="text-lg font-normal text-muted-foreground">/ {t('minute', {ns:'common'})}</span>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('baseRate', 'Base Rate')}</span>
                    <span className="line-through">{baseRate.amount.toFixed(2)} {baseRate.currency}</span>
                </div>
                <div className="flex justify-between text-green-600 dark:text-green-500">
                    <span>{t('discount', { ns: 'common' })} ({appliedDiscount.code})</span>
                    <span>- {(baseRate.amount - effectiveRate.amount).toFixed(2)} {baseRate.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t mt-2">
                    <span>{t('effectiveRate', 'Effective Rate')}</span>
                    <span>{effectiveRate.amount.toFixed(2)} {effectiveRate.currency}</span>
                </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    placeholder={t('discountCodePlaceholder', { ns: 'bookings' })}
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    disabled={isApplying || !!appliedDiscount}
                    className="uppercase font-mono"
                />
                <Button variant="outline" onClick={handleApplyDiscount} disabled={!discountCode || isApplying || !!appliedDiscount}>
                    {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('apply', { ns: 'common' })}
                </Button>
            </div>
            {validationError && <p className="text-xs text-destructive px-1">{validationError}</p>}
            {appliedDiscount && (
                <Button variant="link" size="sm" className="p-0 h-auto text-destructive" onClick={handleRemoveDiscount}>
                    {t('removeDiscount', { ns: 'common' })}
                </Button>
            )}
        </div>
        <p className="text-xs text-muted-foreground text-center px-4">{t('authExplanation', 'A payment authorization will be placed. You will only be charged for the actual duration of the session.')}</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>{t('cancel', { ns: 'common' })}</Button>
          <Button onClick={handleSendRequest} disabled={isSending}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Zap className="mr-2 h-4 w-4" />
            {isSending ? t('sendingRequest', 'Sending...') : t('sendRequest', 'Send Request')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LiveSessionClientRequestModal;