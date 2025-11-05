import React, { useState, useEffect } from 'react';
import { useActiveAnnouncements } from '../hooks/useAnnouncements';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';
import { Info, AlertTriangle, AlertOctagon } from 'lucide-react';
import { logger } from '../utils/logger';

const SEEN_MENU_ANNOUNCEMENTS_KEY = 'coaching_platform_seen_menu_announcements';

const MenuAnnouncementBadge = ({ children }) => {
    const { data: announcements, isLoading } = useActiveAnnouncements('menu_badge');
    const [seen, setSeen] = useState(() => {
        try {
            const item = window.sessionStorage.getItem(SEEN_MENU_ANNOUNCEMENTS_KEY);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            return [];
        }
    });
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    
    useEffect(() => {
        logger.debug('[MenuAnnouncementBadge] Hook check.', {
            isLoading,
            announcements: announcements,
        });
    }, [isLoading, announcements]);
    
    const unseenAnnouncements = announcements?.filter(a => !seen.includes(a._id)) || [];

    const handleOpenChange = (open) => {
        setIsPopoverOpen(open);
        if (open && unseenAnnouncements.length > 0) {
            const allAnnouncementIds = announcements.map(a => a._id);
            setSeen(allAnnouncementIds);
            window.sessionStorage.setItem(SEEN_MENU_ANNOUNCEMENTS_KEY, JSON.stringify(allAnnouncementIds));
            logger.info('[MenuAnnouncementBadge] Marked menu announcements as seen.', { ids: allAnnouncementIds });
        }
    };
    
    if (isLoading) {
        return <>{children}</>;
    }

    if (!unseenAnnouncements.length) {
        logger.debug('[MenuAnnouncementBadge] Render cancelled: No unseen announcements.', {
            totalFetched: announcements?.length || 0,
            seenInSession: seen.length,
        });
        return <>{children}</>;
    }
    
    logger.info(`[MenuAnnouncementBadge] Rendering badge for ${unseenAnnouncements.length} announcements.`);

    const getIcon = (type) => {
        switch (type) {
            case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            case 'critical': return <AlertOctagon className="h-5 w-5 text-red-500" />;
            default: return <Info className="h-5 w-5 text-sky-500" />;
        }
    };

    return (
        <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <div className="relative">
                    {children}
                    <span className="absolute top-0 right-0 -mr-1 -mt-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                    {unseenAnnouncements.map(announcement => (
                        <div key={announcement._id} className="flex items-start gap-3">
                            <div>{getIcon(announcement.type)}</div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{announcement.content}</p>
                                {announcement.actionUrl && announcement.actionText && (
                                    <a 
                                        href={announcement.actionUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="mt-1 inline-block text-xs font-semibold text-primary hover:underline"
                                    >
                                        {announcement.actionText}
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default MenuAnnouncementBadge;