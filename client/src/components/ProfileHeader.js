import React, { useState, useCallback, useRef, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Edit, MessageCircle, Upload, ZoomIn, ZoomOut, Trash2, UserPlus, UserCheck, Loader2, Zap, X, MoreVertical, ShieldX, Banknote, Info, CalendarCheck, ShieldAlert, Check } from 'lucide-react';
import Cropper from 'react-easy-crop';
import * as coachAPI from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import { cancelConnectionRequest } from '../services/connectionAPI';
import { AuthContext } from '../contexts/AuthContext';
import SendMessageModal from './messaging/SendMessageModal';
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from './ui/dialog.tsx';
import { Slider } from './ui/slider.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { Badge } from './ui/badge.tsx';
import { logger } from '../utils/logger';
import { Separator } from './ui/separator.jsx';
import { Input } from './ui/input.tsx';
import { useQueryClient } from 'react-query';
import LiveSessionClientRequestModal from './LiveSessionClientRequestModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import BlockUserMenuItem from './ui/BlockUserMenuItem';
import { useConnectionManagement } from '../hooks/useConnectionManagement';
import ReportModal from './shared/ReportModal';

const ProfileHeader = ({
  isOwnProfile,
  initialCoachData,
  onProfileUpdate,
  onBookSessionClick,
  onLiveSessionClick,
  onConnect,
  onTabChange,
  canViewPricing,
}) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const { user } = useContext(AuthContext);
  const queryClient = useQueryClient();
  const { connections, blockedUserIds } = useConnectionManagement();

  const [coach, setCoach] = useState(initialCoachData || {});
  const [isUploading, setIsUploading] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isEnlargedImageModalOpen, setIsEnlargedImageModalOpen] = useState(false);
   const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const fileInputRef = useRef(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFirstName, setEditedFirstName] = useState('');
  const [editedLastName, setEditedLastName] = useState('');
  const [isEditingHeadline, setIsEditingHeadline] = useState(false);
  const [editedHeadline, setEditedHeadline] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const userId = initialCoachData?.user?._id;
  const isBlocked = blockedUserIds.includes(userId);

  const connection = useMemo(() => {
    if (!userId || !connections) return null;
    return connections.find(c => c.otherUser?._id === userId);
  }, [connections, userId]);
  
  const connectionStatus = connection ? connection.status : 'not_connected';

  const handleCancelConnectionRequest = async () => {
    if (connection && connection._id) {
        try {
            await cancelConnectionRequest(connection._id);
            toast.success(t('coachprofile:cancelRequestSuccess', 'Connection request cancelled.'));
            queryClient.invalidateQueries(['connections', user?._id]);
        } catch (error) {
            logger.error('[ProfileHeader] Error cancelling connection request:', error);
            toast.error(t('coachprofile:cancelRequestError', 'Failed to cancel request.'));
        }
    } else {
        logger.error('[ProfileHeader] Connection ID not found for cancellation');
        toast.error(t('coachprofile:cancelRequestError', 'Failed to cancel request.'));
    }
};

   useEffect(() => {
    if (initialCoachData) {
      setCoach(initialCoachData);
      setEditedFirstName(initialCoachData.user?.firstName || '');
      setEditedLastName(initialCoachData.user?.lastName || '');
      setEditedHeadline(initialCoachData.headline || '');
    }
  }, [initialCoachData]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        setIsImageModalOpen(true);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
    if (event.target) {
      event.target.value = null;
    }
  };

  const updateProfileField = async (field, value) => {
    if (!userId) return toast.error(t('common:errors.userIdNotFound'));
    try {
      const payload = field.includes('.')
        ? { [field.split('.')[0]]: { [field.split('.')[1]]: value } }
        : { [field]: value };

      if (field === 'name') {
        payload.user = { firstName: editedFirstName, lastName: editedLastName };
        delete payload.name;
      }

      const updatedCoach = await coachAPI.updateCoachProfile(userId, payload);
      setCoach(updatedCoach);
      onProfileUpdate(updatedCoach);
      toast.success(t(`coachprofile:${field}UpdatedSuccess`, { defaultValue: 'Profile updated successfully' }));
      return true;
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast.error(t(`coachprofile:errorUpdating${field.charAt(0).toUpperCase() + field.slice(1)}`, { defaultValue: 'Error updating profile' }));
      return false;
    }
  };

  const handleCropComplete = useCallback((_, pixels) => setCroppedAreaPixels(pixels), []);

const handleReportSuccess = () => {
    toast.success(t('coachprofile:reportSubmitted', 'Thank you for your report. Our team will review it shortly.'));
  };

  const handleNameEditToggle = () => {
    setEditedFirstName(coach.user?.firstName || '');
    setEditedLastName(coach.user?.lastName || '');
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    if (await updateProfileField('name')) {
      setIsEditingName(false);
    }
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') handleNameSave();
    if (e.key === 'Escape') handleNameCancel();
  };

  const handleHeadlineEditToggle = () => {
    setEditedHeadline(coach.headline || '');
    setIsEditingHeadline(true);
  };

  const handleHeadlineSave = async () => {
    if (await updateProfileField('headline', editedHeadline)) {
      setIsEditingHeadline(false);
    }
  };

  const handleHeadlineCancel = () => {
    setIsEditingHeadline(false);
  };

  const handleHeadlineKeyDown = (e) => {
    if (e.key === 'Enter') handleHeadlineSave();
    if (e.key === 'Escape') handleHeadlineCancel();
  };

const getCroppedImg = useCallback(async (imageSrc, pixelCrop) => {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = (error) => reject(error);
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return null;
    }

    const zoomFactor = 1.15;

    const diameter = Math.min(pixelCrop.width, pixelCrop.height);
    const zoomedDiameter = diameter / zoomFactor;
    
    const centerX = pixelCrop.x + pixelCrop.width / 2;
    const centerY = pixelCrop.y + pixelCrop.height / 2;
    
    const sourceX = centerX - zoomedDiameter / 2;
    const sourceY = centerY - zoomedDiameter / 2;

    canvas.width = diameter;
    canvas.height = diameter;

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      zoomedDiameter,
      zoomedDiameter,
      0,
      0,
      diameter,
      diameter
    );
    
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg');
    });
  }, []);

  const handleSaveCroppedImage = async () => {
    if (!userId) return toast.error(t('common:errors.userIdNotFound'));
    setIsUploading(true);
    try {
      const croppedImageBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      const file = new File([croppedImageBlob], "profile.jpg", { type: "image/jpeg" });
      const result = await coachAPI.uploadProfilePicture(userId, file);
      setCoach(prev => ({ ...prev, profilePicture: result.profilePicture }));
      onProfileUpdate(result);
      toast.success(t('coachprofile:profilePictureUpdated'));
      setIsImageModalOpen(false);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      toast.error(t('coachprofile:errorUploadingProfilePicture'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePicture = async () => {
    if (!userId) return toast.error(t('common:errors.userIdNotFound'));
    try {
      const updatedCoachData = await coachAPI.removeProfilePicture(userId);
      setCoach(updatedCoachData);
      onProfileUpdate(updatedCoachData);
      toast.success(t('coachprofile:profilePictureRemoved'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error removing profile picture:', error);
      toast.error(t('coachprofile:errorRemovingProfilePicture'));
    }
  };

  const handleEditPicture = useCallback(() => {
    if (coach?.profilePicture?.url) {
        setSelectedImage(coach.profilePicture.url);
        setIsImageModalOpen(true);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
    }
  }, [coach?.profilePicture?.url]);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'online': return { color: 'bg-green-500', text: t('status.online', { ns: 'common' }) };
      case 'on_break': return { color: 'bg-yellow-500', text: t('status.on_break', { ns: 'common' }) };
      case 'busy': return { color: 'bg-red-500', text: t('status.busy', { ns: 'common' }) };
      default: return { color: 'bg-slate-400', text: t('status.offline', { ns: 'common' }) };
    }
  };

  const statusInfo = getStatusInfo(coach?.user?.status);
  const liveSessionRate = coach?.liveSessionRate;
  const isRateValid = liveSessionRate && liveSessionRate.amount > 0;
  const isButtonDisabled = coach?.user?.status !== 'online' || !isRateValid;
  let tooltipMessage = '';
  if (coach?.user?.status !== 'online') {
    tooltipMessage = t('coachprofile:tooltip.offline', 'Coach is currently unavailable for live sessions.');
  } else if (!isRateValid) {
    tooltipMessage = t('coachprofile:tooltip.noRate', 'Live session pricing is not configured by this coach.');
  }

  // Reusable components for DRY code
  const RatingInfo = ({className}) => (
    <button
      onClick={() => onTabChange('reviews')}
      className={`flex items-center text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <Star className="mr-2 h-5 w-5 text-yellow-400 fill-yellow-400" />
      <span className="font-semibold text-foreground">{coach?.rating && coach?.reviews?.length > 0 ? coach.rating.toFixed(1) : t('common:new')}</span>
      <span className="ml-2 text-sm">({coach?.reviews?.length || 0} {t('coachprofile:reviews')})</span>
    </button>
  );

const ConnectionStatus = ({className}) => !isOwnProfile && (
  <div className={className}>
    {connectionStatus === 'accepted' && <Badge variant="secondary" className="text-sm py-1 px-3">{t('coachprofile:connected', { ns: 'common' })}</Badge>}
    {connectionStatus === 'pending' && (
       <Button
        onClick={handleCancelConnectionRequest}
        variant="outline"
        size="th"
        className="text-amber-600 border-amber-500 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500 dark:hover:bg-amber-900/30"
      >
        {t('coachprofile:cancelRequest', 'Cancel Request')}
      </Button>
    )}
    {connectionStatus !== 'accepted' && connectionStatus !== 'pending' && (
      <Button onClick={onConnect} variant="secondary" size="sm"><UserPlus className="mr-2 h-4 w-4" />{t('coachprofile:connect', { ns: 'common' })}</Button>
    )}
  </div>
);

const PricingInfo = ({ className }) => {
    const baseRate = coach?.baseRate;
    const liveSessionRate = coach?.liveSessionRate;

    if (!canViewPricing) {
        return null;
    }

    const hasBaseRate = baseRate && baseRate.amount > 0;
    const hasLiveRate = liveSessionRate && liveSessionRate.amount > 0;

    if (!hasBaseRate && !hasLiveRate) {
        return null;
    }

    return (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`flex items-center gap-3 text-sm text-muted-foreground ${className}`}>
                        {hasBaseRate && (
                            <div className="flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                <span className="font-semibold text-foreground">{baseRate.amount.toFixed(2)} {baseRate.currency}/{t('common:hr', 'Std.')}</span>
                            </div>
                        )}
                        {hasBaseRate && hasLiveRate && <Separator orientation="vertical" className="h-4" />}
                        {hasLiveRate && (
                            <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                <span className="font-semibold text-foreground">{liveSessionRate.amount.toFixed(2)} {liveSessionRate.currency}/min</span>
                            </div>
                        )}
                        <Info className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{t('coachprofile:standardRatesTooltip', 'Standard rates. Final price may vary based on session time, duration, and active promotions.')}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
  
  return (
    <>
      <div className="bg-background border-b p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-8">
          
          <div className="flex flex-col w-full flex-1 gap-4">
              {/* --- MOBILE LAYOUT --- */}
            <div className="lg:hidden">
              <div className="flex w-full items-start gap-4">
                <div className="relative group flex-shrink-0">
                  {isOwnProfile ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer">
                          <Avatar className="h-24 w-24 border-2 border-background shadow-md">
                            <AvatarImage src={coach?.profilePicture?.url} alt={`${coach?.user?.firstName} ${coach?.user?.lastName}`} />
                            <AvatarFallback className="text-4xl">{coach?.user?.firstName?.[0]}{coach?.user?.lastName?.[0]}</AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => fileInputRef.current.click()}>
                        <Upload className="mr-2 h-4 w-4" />
                        <span>{coach?.profilePicture?.url ? t('coachprofile:uploadNew', 'Upload New') : t('coachprofile:uploadPicture', 'Upload Picture')}</span>
                      </DropdownMenuItem>
                      {coach?.profilePicture?.url && (
                        <>
                          <DropdownMenuItem onSelect={() => setTimeout(handleEditPicture, 150)}>
                            <Edit className="mr-2 h-4 w-4" />
                            <span>{t('coachprofile:editPicture', 'Edit Picture')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={handleRemovePicture} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>{t('coachprofile:removePicture', 'Remove Picture')}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <button type="button" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => coach?.profilePicture && setIsEnlargedImageModalOpen(true)} disabled={!coach?.profilePicture}>
                      <Avatar className="h-24 w-24 border-2 border-background shadow-md">
                        <AvatarImage src={coach?.profilePicture?.url} alt={`${coach?.user?.firstName} ${coach?.user?.lastName}`} />
                        <AvatarFallback className="text-4xl">{coach?.user?.firstName?.[0]}{coach?.user?.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                    </button>
                  )}
                  <div className={`absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full border-2 border-background ${statusInfo.color} ring-1 ring-background`}></div>
                </div>
                <div className="flex flex-col items-start pt-1 w-full">
                  {isEditingName ? (
                     <div className="flex flex-col gap-1 w-full">
                        <div className="flex items-center gap-2">
                            <Input value={editedFirstName} onChange={(e) => setEditedFirstName(e.target.value)} placeholder={t('common:firstName')} onKeyDown={handleNameKeyDown} className="text-lg font-bold h-10" autoFocus />
                            <Input value={editedLastName} onChange={(e) => setEditedLastName(e.target.value)} placeholder={t('common:lastName')} onKeyDown={handleNameKeyDown} className="text-lg font-bold h-10" />
                        </div>
                        <div className="flex gap-1 justify-start">
                            <Button variant="ghost" size="icon" onClick={handleNameSave}><Check className="h-5 w-5 text-green-500" /></Button>
                            <Button variant="ghost" size="icon" onClick={handleNameCancel}><X className="h-5 w-5 text-muted-foreground" /></Button>
                        </div>
                    </div>
                  ) : (
                    <h1 onClick={isOwnProfile ? handleNameEditToggle : undefined} className={`text-xl font-bold text-foreground ${isOwnProfile ? 'cursor-pointer' : ''}`}>
                      {coach?.user?.firstName || 'N/A'} {coach?.user?.lastName || 'N/A'}
                    </h1>
                  )}
                  {!isEditingName && (
                    <>
                      <RatingInfo className="mt-1" />
                      <ConnectionStatus className="mt-2" />
                    </>
                  )}
                </div>
              </div>
              {isEditingHeadline ? (
                <div className="flex items-center gap-1 mt-4 w-full">
                    <Input
                        value={editedHeadline}
                        onChange={(e) => setEditedHeadline(e.target.value)}
                        placeholder={t('coachprofile:yourProfessionalHeadline')}
                        onKeyDown={handleHeadlineKeyDown}
                        className="text-base flex-grow"
                        autoFocus
                    />
                    <Button variant="ghost" size="icon" onClick={handleHeadlineSave}><Check className="h-5 w-5 text-green-500" /></Button>
                    <Button variant="ghost" size="icon" onClick={handleHeadlineCancel}><X className="h-5 w-5 text-muted-foreground" /></Button>
                </div>
              ) : (
                <p onClick={isOwnProfile ? handleHeadlineEditToggle : undefined} className={`text-muted-foreground mt-4 ${isOwnProfile ? 'cursor-pointer' : ''}`}>
                  {coach?.headline || t('coachprofile:noHeadline')}
                </p>
              )}
              {!isEditingHeadline && <PricingInfo className="mt-4" />}
            </div>

            {/* --- DESKTOP LAYOUT --- */}
            <div className="hidden lg:flex flex-row items-start gap-6 flex-1">
              <div className="relative group flex-shrink-0">
                <button type="button" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => coach?.profilePicture && !isOwnProfile && setIsEnlargedImageModalOpen(true)} disabled={!coach?.profilePicture || isOwnProfile}>
                  <Avatar className="h-44 w-44 border-4 border-background shadow-md">
                    <AvatarImage src={coach?.profilePicture?.url} alt={`${coach?.user?.firstName} ${coach?.user?.lastName}`} />
                    <AvatarFallback className="text-6xl">{coach?.user?.firstName?.[0]}{coach?.user?.lastName?.[0]}</AvatarFallback>
                  </Avatar>
                </button>
                <div 
                  className={`absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isOwnProfile ? 'cursor-pointer' : 'pointer-events-none'}`}
                  onClick={
                    isOwnProfile 
                    ? (coach?.profilePicture?.url ? handleEditPicture : () => fileInputRef.current.click())
                    : () => {/*empty*/}
                  }
                >
                  {isOwnProfile ? (
                    <div className="flex gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white rounded-full" onClick={() => fileInputRef.current.click()}><Upload size={18} /></Button>
                      {coach?.profilePicture && (<Button size="icon" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white rounded-full" onClick={handleRemovePicture}><Trash2 size={18} /></Button>)}
                    </div>
                  ) : coach?.profilePicture && (<ZoomIn className="text-white h-10 w-10" />)}
                </div>
                <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileChange} />
                <div className={`absolute bottom-3 right-3 w-6 h-6 rounded-full border-2 border-background ${statusInfo.color} ring-2 ring-background`}></div>
              </div>
             <div className="flex flex-col items-start pt-2 flex-grow">
    {isEditingName ? (
        <div className="flex items-center gap-2">
            <Input value={editedFirstName} onChange={(e) => setEditedFirstName(e.target.value)} placeholder={t('common:firstName')} onKeyDown={handleNameKeyDown} className="text-2xl lg:text-4xl font-bold h-auto" autoFocus />
            <Input value={editedLastName} onChange={(e) => setEditedLastName(e.target.value)} placeholder={t('common:lastName')} onKeyDown={handleNameKeyDown} className="text-2xl lg:text-4xl font-bold h-auto" />
            <Button variant="ghost" size="icon" onClick={handleNameSave}><Check className="h-5 w-5 text-green-500" /></Button>
            <Button variant="ghost" size="icon" onClick={handleNameCancel}><X className="h-5 w-5 text-muted-foreground" /></Button>
        </div>
    ) : (
        <h1 className="text-4xl font-bold text-foreground flex items-center group">
            {coach?.user?.firstName || 'N/A'} {coach?.user?.lastName || 'N/A'}
            {isOwnProfile && <Button aria-label={t('common:editName')} variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"><Edit size={16} /></Button>}
        </h1>
    )}

   {isEditingHeadline ? (
        <div className="flex items-center gap-2 mt-2 w-full">
            <Input value={editedHeadline} onChange={(e) => setEditedHeadline(e.target.value)} placeholder={t('coachprofile:yourProfessionalHeadline', 'Your professional headline')} onKeyDown={handleHeadlineKeyDown} className="text-lg flex-grow" autoFocus />
            <Button variant="ghost" size="icon" onClick={handleHeadlineSave}><Check className="h-5 w-5 text-green-500" /></Button>
            <Button variant="ghost" size="icon" onClick={handleHeadlineCancel}><X className="h-5 w-5 text-muted-foreground" /></Button>
        </div>
    ) : (
        <p className="text-lg text-muted-foreground mt-1 flex items-center group">
            {coach?.headline || t('coachprofile:noHeadline')}
            {isOwnProfile && <Button aria-label={t('common:editHeadline')} variant="ghost" size="icon" onClick={handleHeadlineEditToggle} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"><Edit size={16} /></Button>}
        </p>
    )}
    
    <RatingInfo className="mt-3"/>
    <PricingInfo className="mt-4" />
    <ConnectionStatus className="mt-4"/>
</div>
            </div>
          </div>

          {!isOwnProfile && (
            <div className="w-full lg:w-auto flex-shrink-0">
              {/* MOBILE Action Bar */}
              <div className="flex w-full items-center justify-center gap-2 lg:hidden">
                <Button onClick={onBookSessionClick} className="flex-1">{t('coachprofile:bookSession')}</Button>
                <Button onClick={() => setIsMessageModalOpen(true)} variant="outline" className="flex-1">{t('coachprofile:sendMessage')}</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="flex-shrink-0"><MoreVertical size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setIsRequestModalOpen(true)} disabled={isButtonDisabled} className="flex items-center p-2 cursor-pointer"><Zap className="mr-2 h-4 w-4" /> {t('coachprofile:requestLiveSession')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTimeout(() => setIsReportModalOpen(true), 150)} className="flex items-center p-2 cursor-pointer"><ShieldAlert className="mr-2 h-4 w-4" /> {t('coachprofile:reportUser', 'Report User')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center p-2 cursor-pointer"><ShieldX className="mr-2 h-4 w-4" /><BlockUserMenuItem targetUserId={userId} isBlocked={isBlocked} /></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {/* DESKTOP Action Stack */}
              <div className="hidden lg:flex flex-col items-end gap-3">
  <Button onClick={onBookSessionClick} size="lg" className="w-full">{t('coachprofile:bookSession')}</Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild><span className="inline-block w-full"><Button onClick={() => setIsRequestModalOpen(true)} variant="outline" size="lg" disabled={isButtonDisabled} className="w-full" style={isButtonDisabled ? { pointerEvents: "none" } : {}}><Zap className="mr-2" size={16} />{t('coachprofile:requestLiveSession')}</Button></span></TooltipTrigger>
                    {isButtonDisabled && (<TooltipContent><p>{tooltipMessage}</p></TooltipContent>)}
                    {!isButtonDisabled && isRateValid && (<TooltipContent><p>{`${liveSessionRate.amount.toFixed(2)} ${liveSessionRate.currency}/min`}</p></TooltipContent>)}
                  </Tooltip>
                </TooltipProvider>
                <div className="flex items-stretch gap-3 w-full">
                  <Button onClick={() => setIsMessageModalOpen(true)} variant="outline" size="lg" className="flex-grow"><MessageCircle className="mr-2" size={16} />{t('coachprofile:sendMessage')}</Button>
                  <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="lg" className="px-3"><MoreVertical size={16} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTimeout(() => setIsReportModalOpen(true), 150)} className="flex items-center p-2 cursor-pointer"><ShieldAlert className="mr-2 h-4 w-4" /> {t('coachprofile:reportUser', 'Report User')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center p-2 cursor-pointer"><ShieldX className="mr-2 h-4 w-4" /><BlockUserMenuItem targetUserId={userId} isBlocked={isBlocked} /></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
  
      <SendMessageModal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} recipientId={userId} recipientName={`${coach?.user?.firstName} ${coach?.user?.lastName}`} />
      {!isOwnProfile && (<LiveSessionClientRequestModal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} coach={coach} onConfirmRequest={onLiveSessionClick} />)}
      <Dialog open={isEnlargedImageModalOpen} onOpenChange={setIsEnlargedImageModalOpen}>
        <DialogContent className="p-0 bg-transparent border-0 shadow-none max-w-2xl">
          <img src={coach?.profilePicture?.url} alt={`${coach?.user?.firstName} ${coach?.user?.lastName}`} className="w-full h-auto rounded-lg" />
        </DialogContent>
      </Dialog>
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="p-4 sm:p-6">
            <DialogTitle>{t('coachprofile:adjustProfilePicture')}</DialogTitle>
          </DialogHeader>
          
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
            <div className="relative w-full aspect-square bg-muted/50">
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                zoomSpeed={0.1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                restrictPosition={false}
              />
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <ZoomOut size={20} className="text-muted-foreground" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={(value) => setZoom(value[0])}
                aria-label={t('common:zoom')}
              />
              <ZoomIn size={20} className="text-muted-foreground" />
            </div>
          </div>

          <DialogFooter className="p-4 sm:p-6 flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button className="w-full sm:w-auto" variant="ghost" onClick={() => setIsImageModalOpen(false)}>{t('common:cancel')}</Button>
            <Button className="w-full sm:w-auto" onClick={handleSaveCroppedImage} disabled={isUploading}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading ? t('common:uploading') : t('common:saveAndUpload', 'Save & Upload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    {isReportModalOpen && (
        <ReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            entityId={userId}
            entityType="user"
            onReportSuccess={handleReportSuccess}
        />
      )}
    </>
  );
};
  
export default ProfileHeader;