import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { verifyInitialEmail } from '../services/userAPI';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card.tsx';

const InitialEmailVerificationPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(['userprofile', 'common']);

    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('');

    useEffect(() => {
        const handleVerification = async () => {
            if (!token) {
                setStatus('error');
                setMessage(t('userprofile:verificationTokenMissing'));
                return;
            }

            try {
                const response = await verifyInitialEmail(token);
                setStatus('success');
                setMessage(response.message || t('userprofile:initialEmailVerifiedSuccess'));
                toast.success(response.message || t('userprofile:initialEmailVerifiedSuccess'));
            } catch (error) {
                const errorMessage = error.response?.data?.message || t('userprofile:verificationFailed');
                setStatus('error');
                setMessage(errorMessage);
                toast.error(errorMessage);
            }
        };

        handleVerification();
    }, [token, t, navigate]);

    return (
        <div className="flex min-h-dvh items-center justify-center bg-gradient-subtle p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle className="text-2xl">{t('userprofile:emailVerificationTitle')}</CardTitle>
                    <CardDescription>{t('userprofile:emailVerificationSubtitle')}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center space-y-4 p-8">
                    {status === 'verifying' && (
                        <>
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-muted-foreground">{t('userprofile:verifyingEmail')}</p>
                        </>
                    )}
                    {status === 'success' && (
                        <>
                            <CheckCircle className="h-12 w-12 text-green-500" />
                            <p className="font-medium text-foreground">{message}</p>
                            <Button asChild className="w-full">
                                <Link to="/login">{t('common:login')}</Link>
                            </Button>
                        </>
                    )}
                    {status === 'error' && (
                        <>
                            <XCircle className="h-12 w-12 text-destructive" />
                            <p className="font-medium text-destructive">{message}</p>
                            <Button asChild variant="outline" className="w-full">
                                <Link to="/login">{t('common:backToLogin')}</Link>
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default InitialEmailVerificationPage;