import React, { useState, useEffect } from 'react';
import { useActiveAnnouncements } from '../../../hooks/useAnnouncements';
import { X, Info, AlertTriangle, AlertOctagon, Megaphone, ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { logger } from '../../../utils/logger';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../../ui/carousel.jsx';
import { cn } from '../../../lib/utils';

const DISMISSED_DASHBOARD_ANNOUNCEMENTS_KEY = 'coaching_platform_dismissed_dashboard_announcements';

const DashboardAnnouncementWidget = ({ dragHandleProps }) => {
    const { data: announcements, isLoading } = useActiveAnnouncements('dashboard_widget');
    const [dismissed, setDismissed] = useState(() => {
        try {
            const item = window.sessionStorage.getItem(DISMISSED_DASHBOARD_ANNOUNCEMENTS_KEY);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            logger.warn('Failed to parse dismissed dashboard announcements from sessionStorage', error);
            return [];
        }
    });
    
    const [api, setApi] = useState();
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (!api) return;
        setCurrent(api.selectedScrollSnap() + 1);
        api.on("select", () => {
            setCurrent(api.selectedScrollSnap() + 1);
        });
    }, [api]);

    const handleDismiss = (id) => {
        const newDismissed = [...dismissed, id];
        setDismissed(newDismissed);
        window.sessionStorage.setItem(DISMISSED_DASHBOARD_ANNOUNCEMENTS_KEY, JSON.stringify(newDismissed));
    };

    const getAppearance = (type) => {
        switch (type) {
            case 'warning': return { icon: AlertTriangle, bg: 'bg-yellow-400/20 dark:bg-yellow-900/40', text: 'text-yellow-800 dark:text-yellow-200', iconColor: 'text-yellow-600 dark:text-yellow-400' };
            case 'critical': return { icon: AlertOctagon, bg: 'bg-red-500/20 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-200', iconColor: 'text-red-600 dark:text-red-400' };
            default: return { icon: Info, bg: 'bg-sky-500/20 dark:bg-sky-900/40', text: 'text-sky-800 dark:text-sky-200', iconColor: 'text-sky-600 dark:text-sky-400' };
        }
    };
    
    const visibleAnnouncements = announcements?.filter(a => !dismissed.includes(a._id)) || [];

    if (isLoading) {
        return (
            <Card>
                <CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader>
                <CardContent><Skeleton className="h-24 w-full rounded-lg" /></CardContent>
            </Card>
        );
    }
    
    if (!visibleAnnouncements.length) {
        return null;
    }

    return (
        <Card className="flex flex-col border-0 shadow-none bg-transparent" {...dragHandleProps}>
            <CardHeader className="flex-row items-center justify-between px-1 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Megaphone className="h-5 w-5 text-muted-foreground" />
                    Announcements
                </CardTitle>
                {visibleAnnouncements.length > 1 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span>{current}</span>
                        <span>/</span>
                        <span>{visibleAnnouncements.length}</span>
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-0">
                <Carousel setApi={setApi} className="w-full">
                    <CarouselContent>
                        {visibleAnnouncements.map((announcement) => {
                            const { icon: Icon, bg, text, iconColor } = getAppearance(announcement.type);
                            return (
                                <CarouselItem key={announcement._id}>
                                    <div className={cn("relative w-full overflow-hidden rounded-xl p-4 md:p-6", bg)}>
                                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                                            <div className="flex-shrink-0">
                                                 <Icon className={cn("h-6 w-6", iconColor)} />
                                            </div>
                                            <div className="flex-1">
                                                <p className={cn("text-base font-semibold", text, "dark:text-white")}>
                                                    {announcement.actionText || announcement.content}
                                                </p>
                                                {announcement.actionText && (
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {announcement.content}
                                                    </p>
                                                )}
                                            </div>
                                            {announcement.actionUrl && (
                                                <div className="w-full sm:w-auto">
                                                    <Button asChild variant={announcement.type === 'critical' ? 'destructive' : 'default'} className="group w-full sm:w-auto">
                                                        <a href={announcement.actionUrl} target="_blank" rel="noopener noreferrer">
                                                            {announcement.actionText || 'Learn More'}
                                                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                                        </a>
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {announcement.type !== 'critical' && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="absolute top-2 right-2 h-7 w-7 flex-shrink-0 text-muted-foreground hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                                                onClick={() => handleDismiss(announcement._id)}
                                            >
                                                <X className="h-4 w-4" />
                                                <span className="sr-only">Dismiss</span>
                                            </Button>
                                        )}
                                    </div>
                                </CarouselItem>
                            );
                        })}
                    </CarouselContent>
                    {visibleAnnouncements.length > 1 && (
                        <>
                            <CarouselPrevious className="absolute left-[-12px] top-1/2 -translate-y-1/2 hidden md:inline-flex" />
                            <CarouselNext className="absolute right-[-12px] top-1/2 -translate-y-1/2 hidden md:inline-flex" />
                        </>
                    )}
                </Carousel>
            </CardContent>
        </Card>
    );
};

export default DashboardAnnouncementWidget;