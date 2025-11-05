import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.tsx';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { logger } from '../utils/logger';
import { stripePromise } from '../contexts/PaymentContext';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const AuthorizationForm = ({ clientSecret, onSuccess, onFailure, onClose }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { t } = useTranslation(['payments', 'liveSession']);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!stripe || !elements) return;

        setIsProcessing(true);
        setErrorMessage(null);

        const { error } = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: {
                return_url: `${window.location.origin}/live-session-auth-complete`, // A dummy URL
            },
            redirect: 'if_required',
        });

        if (error) {
            logger.error('[LiveSessionAuthModal] Stripe confirmation failed', { error });
            setErrorMessage(error.message || t('payments:error.scaConfirmationFailed'));
            setIsProcessing(false);
            onFailure(error);
        } else {
            logger.info('[LiveSessionAuthModal] Stripe confirmation successful');
            setIsProcessing(false);
            onSuccess();
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader className="p-6 pb-4">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                    {t('liveSession:authorizeSessionTitle')}
                </DialogTitle>
                <DialogDescription>{t('liveSession:authorizeSessionDescription')}</DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-6">
                <div className="p-4 border rounded-md bg-muted/30">
                    <PaymentElement />
                </div>
                <AnimatePresence>
                    {errorMessage && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{t('payments:error.title')}</AlertTitle>
                                <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <DialogFooter className="p-4 bg-muted/50">
                <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>
                    {t('common:cancel')}
                </Button>
                <Button type="submit" disabled={!stripe || isProcessing}>
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    {isProcessing ? t('payments:authorizing') : t('liveSession:authorizeAndStart')}
                </Button>
            </DialogFooter>
        </form>
    );
};

const LiveSessionAuthorizationModal = ({ isOpen, onClose, clientSecret, onSuccess, onFailure }) => {
    if (!isOpen || !clientSecret) return null;

    const options = {
        clientSecret,
        appearance: { theme: 'stripe' },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog open={isOpen} onOpenChange={onClose}>
                    <DialogContent className="sm:max-w-md p-0">
                        <motion.div initial={{ y: 25, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                            <Elements stripe={stripePromise} options={options}>
                                <AuthorizationForm
                                    clientSecret={clientSecret}
                                    onSuccess={onSuccess}
                                    onFailure={onFailure}
                                    onClose={onClose}
                                />
                            </Elements>
                        </motion.div>
                    </DialogContent>
                </Dialog>
            )}
        </AnimatePresence>
    );
};

export default LiveSessionAuthorizationModal;