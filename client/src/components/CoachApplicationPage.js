import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import LeadCaptureForm from './shared/LeadCaptureForm';
import { ArrowLeft } from 'lucide-react';

const CoachApplicationPage = () => {
    const { t } = useTranslation('signup');

    return (
        <div className="min-h-full bg-muted/40 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
             <div className="w-full max-w-3xl mx-auto">
                <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
                    <ArrowLeft className="h-4 w-4" />
                    {t('coach.application.backToHome', 'Back to Home')}
                </Link>
                <Card className="w-full">
                    <CardHeader className="text-center">
                        <CardTitle className="text-3xl font-bold">{t('coach.application.pageTitle', 'Apply to the Founder Community')}</CardTitle>
                        <CardDescription className="max-w-2xl mx-auto pt-2">
                            {t('coach.application.pageSubtitle', 'Help shape the future of coaching and receive exclusive lifetime benefits including no platform fees for your first year, priority support, and a featured placement at launch.')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LeadCaptureForm userType="coach" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default CoachApplicationPage;