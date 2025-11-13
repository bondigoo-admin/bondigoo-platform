import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';
import { LogIn, AlertTriangle } from 'lucide-react';

const SessionExpired = () => {
    const { t } = useTranslation(['common', 'login']);

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/50">
                        <AlertTriangle className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
                    </div>
                    <CardTitle className="mt-4 text-2xl font-bold">{t('sessionExpired.title', 'Session Expired')}</CardTitle>
                    <CardDescription>{t('sessionExpired.description', 'For your security, you have been logged out. Please log in again to continue.')}</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button asChild className="w-full" size="lg">
                        <Link to="/login">
                            <LogIn className="mr-2 h-4 w-4" />
                            {t('login:logIn')}
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default SessionExpired;