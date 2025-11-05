import React, { useState, useEffect } from 'react';
import { useActiveAnnouncements } from '../hooks/useAnnouncements';
import { trackAnnouncementView } from '../services/announcementAPI';
import { logger } from '../utils/logger';
import { Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';

const DISMISSED_BANNERS_KEY = 'coaching_platform_dismissed_banners';
const VIEWED_BANNERS_KEY = 'coaching_platform_viewed_banners';

const GlobalAnnouncementBanner = () => {
    const { data: announcements, isLoading } = useActiveAnnouncements();
    const [dismissedBanners, setDismissedBanners] = useState(() => {
        try {
            const item = window.sessionStorage.getItem(DISMISSED_BANNERS_KEY);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            return [];
        }
    });
    // State to track views within the current session
    const [viewedBanners, setViewedBanners] = useState(() => {
        try {
            const item = window.sessionStorage.getItem(VIEWED_BANNERS_KEY);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            return [];
        }
    });


    useEffect(() => {
        logger.debug('[GlobalAnnouncementBanner] Component mounted or dependencies changed.', {
            isLoading,
            announcementsCount: announcements?.length,
        });
    }, [announcements, isLoading]);

    const handleDismiss = (id) => {
        logger.info(`[GlobalAnnouncementBanner] Dismissing banner ID: ${id}`);
        const newDismissed = [...dismissedBanners, id];
        setDismissedBanners(newDismissed);
        window.sessionStorage.setItem(DISMISSED_BANNERS_KEY, JSON.stringify(newDismissed));
    };
    
    const visibleAnnouncements = announcements?.filter(a => !dismissedBanners.includes(a._id)) || [];
    
    useEffect(() => {
        if (visibleAnnouncements.length > 0) {
            logger.info('[GlobalAnnouncementBanner] Processing visible announcements for view tracking.', {
                visibleCount: visibleAnnouncements.length,
                viewedSoFar: viewedBanners,
            });

            const newBannersToTrack = visibleAnnouncements.filter(a => !viewedBanners.includes(a._id));
            
            if (newBannersToTrack.length > 0) {
                logger.info('[GlobalAnnouncementBanner] Found new announcements to track views for.', {
                    count: newBannersToTrack.length,
                    ids: newBannersToTrack.map(a => a._id),
                });
                
                newBannersToTrack.forEach(announcement => {
                    trackAnnouncementView(announcement._id).catch(err => 
                        logger.error(`[GlobalAnnouncementBanner] Failed to track view for banner ${announcement._id}`, err)
                    );
                });

                const allViewedIds = [...viewedBanners, ...newBannersToTrack.map(a => a._id)];
                setViewedBanners(allViewedIds);
                window.sessionStorage.setItem(VIEWED_BANNERS_KEY, JSON.stringify(allViewedIds));
            } else {
                 logger.debug('[GlobalAnnouncementBanner] No new announcements to track views for this session.');
            }
        }
    }, [visibleAnnouncements, viewedBanners]);


    if (isLoading) {
        return null; // Don't show anything while loading
    }
    
    logger.debug('[GlobalAnnouncementBanner] Pre-render check.', {
        initialAnnouncements: announcements?.length,
        dismissedCount: dismissedBanners.length,
        visibleCount: visibleAnnouncements.length,
    });
    
    if (visibleAnnouncements.length === 0) {
        return null;
    }

    const getBannerStyle = (type) => {
        switch (type) {
            case 'warning': return 'bg-yellow-400 text-yellow-900';
            case 'critical': return 'bg-red-500 text-white';
            default: return 'bg-sky-500 text-white';
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'warning': return <AlertTriangle className="h-5 w-5" />;
            case 'critical': return <AlertOctagon className="h-5 w-5" />;
            default: return <Info className="h-5 w-5" />;
        }
    };
    
    return (
        <div>
            {visibleAnnouncements.map(announcement => (
                 <div key={announcement._id} className={`relative flex items-center justify-center gap-x-6 px-6 py-2.5 sm:px-3.5 text-sm font-medium ${getBannerStyle(announcement.type)}`}>
                    <div className="flex items-center gap-2">
                        {getIcon(announcement.type)}
                        <p>{announcement.content}</p>
                        {announcement.actionUrl && announcement.actionText && (
                            <a 
                                href={announcement.actionUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="ml-4 inline-block rounded-md border border-transparent bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-100"
                            >
                                {announcement.actionText}
                            </a>
                        )}
                    </div>
                    {announcement.type !== 'critical' && (
                         <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <button type="button" onClick={() => handleDismiss(announcement._id)} className="-m-1.5 flex-none p-1.5">
                                <span className="sr-only">Dismiss</span>
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default GlobalAnnouncementBanner;