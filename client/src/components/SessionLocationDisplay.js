import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Video, Globe, Edit, Check, Loader2, Home } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Switch } from './ui/switch.tsx';
import { Label } from './ui/label.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const SessionLocationDisplay = ({
  booking,
  onSave,
  isSaving,
  canEdit,
  sessionUrl,
  canAccessContent,
  onCopyLink,
  copied,
  isEditing,
  onEditToggle,
}) => {
  const { t } = useTranslation(['bookings', 'common']);
  const formRef = useRef(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (isEditing) {
      const initialJoinUrl = booking.virtualMeeting?.joinUrl || sessionUrl || '';
      setIsOnline(booking.isOnline || !!initialJoinUrl);
    }
  }, [isEditing, booking, sessionUrl]);

  const handleSave = useCallback(() => {
    if (!formRef.current) return;
    const locationData = {
      location: formRef.current.location.value,
      virtualMeeting: { joinUrl: formRef.current['virtualMeeting.joinUrl'].value },
      isOnline: isOnline,
    };
    onSave(locationData);
  }, [isOnline, onSave]);

  if (isEditing) {
    const initialJoinUrl = booking.virtualMeeting?.joinUrl || sessionUrl || '';
    return (
      <Card className="bg-muted/30 dark:bg-muted/20">
        <CardContent className="p-4">
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location">{t('bookings:location')}</Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={booking.location || ''}
                  placeholder={t('bookings:locationPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="virtualMeetingUrl">{t('bookings:meetingLink')} ({t('common:optional')})</Label>
                <Input
                  id="virtualMeetingUrl"
                  name="virtualMeeting.joinUrl"
                  type="url"
                  defaultValue={initialJoinUrl}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isOnline"
                  name="isOnline"
                  checked={isOnline}
                  onCheckedChange={setIsOnline}
                />
                <Label htmlFor="isOnline">{t('bookings:isOnlineSession')}</Label>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <Button variant="outline" type="button" onClick={onEditToggle}>{t('common:cancel')}</Button>
                <Button type="button" onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common:save')}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

const linkToDisplay = booking.virtualMeeting?.joinUrl?.trim() || sessionUrl?.trim() || null;
  const hasLocation = booking.location && booking.location.trim() !== '';
  const hasAnyInfoToShow = linkToDisplay || hasLocation || booking.isOnline;

  if (!hasAnyInfoToShow) {
    if (canEdit) {
      return (
        <Card className="bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t('bookings:sessionLocationAndLink')}</h4>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEditToggle}>
                <Edit className="h-3.5 w-3.5 mr-1" />
                {t('common:add')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{t('bookings:noLocationSet')}</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="bg-muted/30 dark:bg-muted/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-sm font-semibold">{t('bookings:sessionLocationAndLink')}</h4>
          {canEdit && (
            <Button variant="ghost" size="sm" className="h-7 px-2 -mt-1" onClick={onEditToggle}>
              <Edit className="h-3.5 w-3.5 mr-1" />
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {hasLocation && (
            <div className="flex items-center gap-2 text-sm">
              {booking.isOnline || linkToDisplay ? (
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span>{booking.location}</span>
            </div>
          )}

          {linkToDisplay &&
            (canAccessContent ? (
              <div className="flex items-center justify-between gap-2">
                <a href={linkToDisplay.startsWith('http') ? linkToDisplay : `https://${linkToDisplay}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline overflow-hidden">
                  <Video className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{t('bookings:joinSession')}</span>
                </a>
                <div className="flex items-center flex-shrink-0">
                  <Button onClick={() => onCopyLink(linkToDisplay)} variant="ghost" size="sm" className="h-7 px-2">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <span className="text-xs">{t('common:copy')}</span>}
                  </Button>
                </div>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground cursor-not-allowed opacity-60">
                      <Video className="h-4 w-4 flex-shrink-0" />
                      <span>{t('bookings:sessionLink')}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('bookings:completePaymentToUnlock')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}

          {booking.isOnline && !linkToDisplay && !hasLocation && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <span>{t('bookings:onlineSession')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default memo(SessionLocationDisplay);