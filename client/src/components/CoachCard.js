import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { Star, UserCheck, Zap, MessageCircle, CalendarPlus, ArrowRight, ShieldCheck } from 'lucide-react'; 
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { getUserConnections, requestConnection, cancelConnectionRequest } from '../services/connectionAPI';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// ShadCN/UI component imports
import { Card, CardContent, CardFooter } from './ui/card.tsx';
import { Badge } from './ui/badge.tsx';
import { Button } from './ui/button.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { logger } from '../utils/logger';
import { cn } from '../lib/utils';

const CoachCard = ({ coach, isAuthenticated, onInitiateRequest, variant, view = 'grid', isPreviewMode = false }) => {
  
  const navigate = useNavigate();
  const { t } = useTranslation(['common', 'coachList', 'liveSession']);
  const queryClient = useQueryClient();
  const { user: loggedInUser } = useAuth();
  
  const [isConnecting, setIsConnecting] = useState(false);
  const isInsuranceRecognized = coach.settings?.insuranceRecognition?.isRecognized;

  logger.debug(`[CoachCard] Coach ID: ${coach.userId}, isInsuranceRecognized: ${isInsuranceRecognized}`);
  
  const coachId = coach.user._id;

  const getStatusInfo = (status) => {
    switch (status) {
        case 'online': return { color: 'bg-green-500', text: t('status.online', { ns: 'common' }) };
        case 'on_break': return { color: 'bg-yellow-500', text: t('status.on_break', { ns: 'common' }) };
        case 'busy': return { color: 'bg-red-500', text: t('status.busy', { ns: 'common' }) };
        default: return { color: 'bg-slate-400', text: t('status.offline', { ns: 'common' }) };
    }
  };

  const { statusInfo, isButtonDisabled, tooltipMessage, isRateValid, liveSessionRate } = useMemo(() => {
    const currentStatus = coach.user?.status;
    const statusInfo = getStatusInfo(currentStatus);
    
    const liveSessionRate = coach.liveSessionRate;
    const isRateValid = liveSessionRate && liveSessionRate.amount > 0;
    const isButtonDisabled = currentStatus !== 'online' || !isRateValid;

    let tooltipMessage = '';
    if (currentStatus !== 'online') {
      tooltipMessage = t('liveSession:coachNotAvailable');
    } else if (!isRateValid) {
      tooltipMessage = t('liveSession:rateNotSet');
    }
    
    return { statusInfo, isButtonDisabled, tooltipMessage, isRateValid, liveSessionRate };
  }, [coach.user?.status, coach.liveSessionRate, t]);

 const handleRequestLiveSession = (e) => {
    e.stopPropagation();
    onInitiateRequest(coach);
  };

  const profilePictureUrl = coach.profilePicture?.url || coach.user?.profilePicture?.url || coach.user?.profilePicture;
  const reviewCount = coach.reviewCount ?? coach.reviews?.length ?? 0;
  const displayRating = coach.rating && reviewCount > 0 ? coach.rating.toFixed(1) : t('common:notRated');

  const { data: connection } = useQuery(
    ['connections', loggedInUser?._id],
    getUserConnections,
    {
      enabled: isAuthenticated && !!loggedInUser?._id,
      staleTime: 5 * 60 * 1000,
      select: (data) => {
        const connections = data?.connections || (Array.isArray(data) ? data : []);
        return connections.find(c => c.otherUser?._id === coachId);
      },
      onError: (error) => console.error('[CoachCard] Error fetching connections for status:', error),
    }
  );

  const connectionStatus = connection ? connection.status : 'not_connected';

const handleViewProfile = () => {
  if (isPreviewMode) {
    window.open(`/coach-profile/${coachId}?preview=true`, '_blank', 'noopener,noreferrer');
  } else {
    navigate(`/coach-profile/${coachId}`);
  }
};

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await requestConnection(coachId);
      queryClient.invalidateQueries(['connections', loggedInUser?._id]);
      toast.success(t('coachList:connectionRequestSuccess'));
    } catch (error) {
      console.error('[CoachCard] Error sending connection request:', error);
      toast.error(t('coachList:connectionRequestError'));
    } finally {
      setIsConnecting(false);
    }
  };

 const handleCancelConnectionRequest = async () => {
    if (connection && connection._id) {
      try {
        await cancelConnectionRequest(connection._id);
        toast.success(t('coachList:cancelRequestSuccess'));
        queryClient.invalidateQueries(['connections', loggedInUser?._id]);
      } catch (error) {
        console.error('[CoachCard] Error cancelling connection request:', error);
        toast.error(t('coachList:cancelRequestError'));
      }
    } else {
      console.error('[CoachCard] Connection ID not found for cancellation');
      toast.error(t('coachList:cancelRequestError'));
    }
  };

  const renderConnectionButton = () => {
    if (!isAuthenticated) return null;

    switch (connectionStatus) {
      case 'accepted':
        return (
          <Button variant="secondary" disabled className="w-full">
            <UserCheck className="w-4 h-4 mr-2" />
            {t('coachList:connected')}
          </Button>
        );
      case 'pending':
        return (
          <Button
            variant="outline"
            onClick={handleCancelConnectionRequest}
            className="w-full text-amber-600 border-amber-500 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500 dark:hover:bg-amber-900/30"
          >
            {t('coachList:cancelRequest')}
          </Button>
        );
      default:
        return (
          <Button onClick={handleConnect} disabled={isConnecting} variant="outline" className="w-full">
            {isConnecting ? t('common:loading') : t('coachList:connect')}
          </Button>
        );
    }
  };
  
const renderPrice = () => {
    const rate = coach.minimumHourlyRate?.amount;
    const currency = coach.minimumHourlyRate?.currency;

    if (typeof rate !== 'number' || rate <= 0) {
      return <span>{t('coachList:rateOnRequest', 'On Request')}</span>;
    }
    
    return (
      <span>
        {t('coachList:startingFromRate', {
          rate: rate.toFixed(0),
          currency: currency || 'USD',
        })}
      </span>
    );
  };
  
  const liveSessionButton = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full"> 
            <Button 
              onClick={handleRequestLiveSession} 
              disabled={isButtonDisabled}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              {t('liveSession:liveSession', 'Live Session')}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent className="p-3 max-w-xs">
          {isButtonDisabled ? (
             <p>{tooltipMessage}</p>
          ) : (
            <div className="flex flex-col gap-2 text-center">
                {isRateValid && (
                  <span className="font-semibold text-lg">{`${liveSessionRate.amount.toFixed(2)} ${liveSessionRate.currency}/min`}</span>
                )}
                <p className="text-xs text-muted-foreground">
                    {t('liveSession:preAuthNotice')}
                </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

if (view === 'list') {
    return (
      <TooltipProvider>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="group">
            <div className="flex flex-col sm:flex-row items-stretch gap-4 p-3 border rounded-lg hover:shadow-lg transition-shadow duration-300 bg-card dark:border-slate-800 w-full">
                <div className="relative flex-shrink-0 w-full sm:w-32 h-32 sm:h-auto self-start cursor-pointer" onClick={handleViewProfile}>
                    <img src={profilePictureUrl } alt={`${coach.user?.firstName || 'Coach'} ${coach.user?.lastName || ''}`} className="w-full h-full object-cover rounded-md transition-transform duration-300 ease-in-out group-hover:scale-105" />
                    <div className="absolute top-2 left-2 z-10">
   <Tooltip><TooltipTrigger><div className={cn('h-3 w-3 rounded-full border-2 border-white dark:border-slate-900', statusInfo.color, coach.user?.status === 'online' && 'animate-pulse')} /></TooltipTrigger><TooltipContent><p>{statusInfo.text}</p></TooltipContent></Tooltip>
</div>
                </div>

                <div className="flex flex-col flex-1 min-w-0 py-1">
                     <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-lg font-semibold leading-snug text-foreground truncate cursor-pointer hover:text-primary transition-colors flex items-center gap-2" onClick={handleViewProfile}>
                                <span>{`${coach.user?.firstName || ''} ${coach.user?.lastName || ''}`}</span>
                                {isInsuranceRecognized && (
                                    <Tooltip><TooltipTrigger asChild><span className="flex items-center text-blue-500"><ShieldCheck className="h-4 w-4" /></span></TooltipTrigger><TooltipContent><p>{t('coachList:insuranceRecognizedTooltip')}</p></TooltipContent></Tooltip>
                                )}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 truncate">{coach.headline || t('coachList:defaultHeadline')}</p>
                        </div>
                        <div className="hidden lg:flex items-center gap-1.5 cursor-default text-muted-foreground shrink-0 ml-4"><Star className="h-4 w-4 text-amber-400" /><span className="font-semibold text-foreground">{displayRating}</span><span className="text-xs">({reviewCount})</span></div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">{coach.specialties?.slice(0, 5).map(s => (<Badge key={s._id || s.name} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{s.translation || s.name}</Badge>))}</div>
                    <div className="flex-grow" />
                    <div className="flex lg:hidden items-center gap-1.5 mt-3 text-sm text-muted-foreground"><Star className="h-4 w-4 text-amber-400" /><span className="font-semibold text-foreground">{displayRating}</span><span className="text-xs">({reviewCount})</span></div>
                </div>

                <div className="w-full sm:w-44 flex-shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 pt-3 sm:pt-0 sm:border-l sm:pl-4 border-t sm:border-t-0 border-dashed dark:border-slate-700">
                    <div className="text-base font-bold text-primary shrink-0 flex items-center gap-1.5">{renderPrice()}</div>
                    <div className="w-full sm:w-full flex sm:flex-col gap-2">{isAuthenticated ? <>{renderConnectionButton()}{liveSessionButton}</> : <Button asChild className="w-full"><Link to={`/coach/${coachId}`}>{t('coachList:viewProfile', 'View Profile')}</Link></Button>}</div>
                </div>
            </div>
       </motion.div>
      </TooltipProvider>
    );
  }

  const isCompact = view === 'compact';
  return (
    <TooltipProvider>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="group h-full">
        <Card className="h-full flex flex-col overflow-hidden transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/20 border dark:border-slate-800">
          <div className={cn("relative w-full overflow-hidden cursor-pointer", isCompact ? 'aspect-square' : 'aspect-video')} onClick={handleViewProfile}>
            <img src={profilePictureUrl} alt={`${coach.user?.firstName || 'Coach'} ${coach.user?.lastName || ''}`} className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
            <div className="absolute top-2 left-2 z-10">
    <Tooltip><TooltipTrigger><div className={cn('h-4 w-4 rounded-full border-2 border-white dark:border-slate-900', statusInfo.color, coach.user?.status === 'online' && 'animate-pulse')} /></TooltipTrigger><TooltipContent><p>{statusInfo.text}</p></TooltipContent></Tooltip>
</div>
          </div>
          <CardContent className={cn("p-4 flex flex-col flex-grow", isCompact && "p-3")}>
            <h3 className={cn("font-semibold leading-snug text-foreground truncate cursor-pointer transition-colors group-hover:text-primary", isCompact ? 'text-base' : 'text-lg')} onClick={handleViewProfile}>{`${coach.user?.firstName || ''} ${coach.user?.lastName || ''}`}</h3>
            <p className={cn("text-muted-foreground mt-1 truncate", isCompact ? "text-xs" : "text-sm")}>{coach.headline || 'Experienced Life Coach'}</p>
            <div className="flex flex-wrap gap-1 mt-3">{coach.specialties?.slice(0, isCompact ? 2 : 3).map(s => (<Badge key={s._id || s.name} variant="secondary" className="px-2 py-0.5 text-xs font-medium">{s.translation || s.name}</Badge>))}</div>
            <div className="flex-grow" />
            <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-slate-800 text-sm">
              <div className="flex items-center gap-3">
                <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 cursor-default text-muted-foreground"><Star className="h-4 w-4 text-amber-400" /><span className="font-semibold text-foreground">{displayRating}</span><span className="text-xs">({reviewCount})</span></div></TooltipTrigger><TooltipContent><p>{t('coachList:reviewsTooltip', { count: reviewCount })}</p></TooltipContent></Tooltip>
                {isInsuranceRecognized && (
                  <Tooltip><TooltipTrigger asChild><div className="flex items-center text-blue-500"><ShieldCheck className="h-4 w-4" /></div></TooltipTrigger><TooltipContent><p>{t('coachList:insuranceRecognizedTooltip')}</p></TooltipContent></Tooltip>
                )}
              </div>
              <Tooltip><TooltipTrigger asChild><div className="text-base font-bold text-primary shrink-0 ml-2 flex items-center gap-1.5 cursor-default">{renderPrice()}</div></TooltipTrigger><TooltipContent><p>{t('coachList:startingRateTooltip')}</p></TooltipContent></Tooltip>
            </div>
         </CardContent>
          <CardFooter className={cn("p-3 border-t dark:border-slate-800", isCompact ? "p-2" : "")}>
            {isAuthenticated ? (
                <div className={cn("grid w-full gap-2", isCompact ? "grid-cols-1" : "grid-cols-2")}>
                    {variant === 'user-dashboard' ? (<>
                        <Button asChild variant="outline" className="w-full"><Link to={`/messages?with=${coach.user._id}`}><MessageCircle className="w-4 h-4 mr-2" />{t('common:message')}</Link></Button>
                        <Button asChild className="w-full"><Link to={`/coach/${coach.user._id}`}><CalendarPlus className="w-4 h-4 mr-2" />{t('common:book')}</Link></Button>
                    </>) : (<>{renderConnectionButton()}{liveSessionButton}</>)}
                </div>
            ) : (
                  <Button onClick={handleViewProfile} className="w-full group">
                      {t('coachList:viewProfile', 'View Profile')}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
              )}
          </CardFooter>
        </Card>
      </motion.div>
    </TooltipProvider>
  );
};

export default CoachCard;