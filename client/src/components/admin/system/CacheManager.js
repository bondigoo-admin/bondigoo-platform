import React, { useState } from 'react';
import { useFlushCacheKey } from '../../../hooks/useAdmin';
import { Button } from '../../ui/button.tsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../ui/alert-dialog.tsx';

const CacheManager = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [cacheKey, setCacheKey] = useState('');
    const flushMutation = useFlushCacheKey();

    const handleFlush = () => {
        if (!cacheKey) {
            toast.error(t('system.cache.error.keyRequired'));
            return;
        }

        flushMutation.mutate(cacheKey, {
            onSuccess: (data) => {
                toast.success(data.message || t('system.cache.success.flushed'));
                setCacheKey('');
            },
            onError: (error) => {
                toast.error(error.response?.data?.message || t('system.cache.error.flushFailed'));
            },
        });
    };

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>{t('system.cache.title')}</CardTitle>
                <CardDescription>{t('system.cache.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="cache-key">{t('system.cache.keyLabel')}</Label>
                    <Input
                        id="cache-key"
                        placeholder="e.g., user-profile:653a..."
                        value={cacheKey}
                        onChange={(e) => setCacheKey(e.target.value)}
                        disabled={flushMutation.isLoading}
                    />
                </div>
                
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={!cacheKey || flushMutation.isLoading} className="w-full sm:w-auto">
                            {flushMutation.isLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {t('system.cache.flushButton')}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('system.cache.confirm.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('system.cache.confirm.description', { key: cacheKey })}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleFlush}>
                                {t('common:continue')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <div className="text-sm p-4 bg-muted rounded-lg space-y-2">
                    <h4 className="font-semibold">{t('system.cache.patternsTitle')}</h4>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li><code>price:[coachId]:[sessionTypeId]:[start]:[end]</code></li>
                        <li><code>user-profile:[userId]</code></li>
                        <li><code>coach-availability:[coachId]</code></li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
};

export default CacheManager;