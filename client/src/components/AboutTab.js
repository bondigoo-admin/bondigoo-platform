import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AboutTabBio from './abouttab_Bio';
import { Video, User, Award, Book, Briefcase, MapPin, DollarSign, Globe, Edit, Trash2, Upload, AlertCircle, Loader2 } from 'lucide-react';
import CustomVideoPlayer from './player/CustomVideoPlayer.js';
import VideoEditorModal from './VideoEditorModal'; 
import SearchableListSelector from './SearchableListSelector';
import * as coachAPI from '../services/coachAPI';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { Button } from './ui/button.tsx';
import 'react-quill/dist/quill.snow.css';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.tsx';
import { ShieldCheck, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { backgroundUploader } from '../services/backgroundUploader';
import { getVideoIntroductionSignature } from '../services/coachAPI';
import { Progress } from './ui/progress.jsx';

const areItemListsEqual = (listA, listB, listType) => {
    if (!Array.isArray(listA) || !Array.isArray(listB) || listA.length !== listB.length) {
        return false;
    }

    const normalizeItem = (item) => {
        if (!item) return null;
        if (listType === 'languages') {
            const id = item.language?._id || item._id;
            const strength = item.strength;
            return `${id}:${strength}`;
        }
        return item._id;
    };

    const sortedA = listA.map(normalizeItem).sort();
    const sortedB = listB.map(normalizeItem).sort();

    if (sortedA.includes(null) || sortedB.includes(null)) {
        return false;
    }

    return JSON.stringify(sortedA) === JSON.stringify(sortedB);
};

const AboutTab = ({ coach, isEditing, isOwnProfile, onInputChange, onItemsUpdate, onSave, onCancel, onVideoUpdate, onEditInsurance }) => {
   logger.info('%c[AboutTab] RENDER', 'background: #222; color: #bada55', {
    specialties: coach.specialties,
    educationLevels: coach.educationLevels,
    languages: coach.languages,
    coachingStyles: coach.coachingStyles,
    skills: coach.skills,
  });
  const { t } = useTranslation(['common', 'coachprofile']);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [localVideoData, setLocalVideoData] = useState(coach.videoIntroduction);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

const handleListUpdate = useCallback((listType, updatedItems) => {
    if (isOwnProfile) {
        const originalItems = coach[listType] || [];

        if (areItemListsEqual(originalItems, updatedItems, listType)) {
            return;
        }

        onItemsUpdate(listType, updatedItems);

        coachAPI.updateCoachProfileItems(listType, updatedItems)
            .then((response) => {
                //toast.success(t('coachprofile:updateSuccess', { field: t(`coachprofile:${listType}`) }));
            })
            .catch((error) => {
                console.error(`[AboutTab] Error updating ${listType}:`, error);
                toast.error(t('coachprofile:updateError', { field: t(`coachprofile:${listType}`) }));
                onItemsUpdate(listType, originalItems);
            });
    }
}, [isOwnProfile, onItemsUpdate, coach, t]);

  useEffect(() => {
    setLocalVideoData(coach.videoIntroduction);
  }, [coach.videoIntroduction]);

const handleVideoUpload = (uploadData) => {
    const { videoFile, trimStart, trimEnd, existingVideo, thumbnailFile } = uploadData;
    setShowVideoEditor(false);

    if (!videoFile && existingVideo) {
        setIsVideoLoading(true);
        const trimmedDuration = trimEnd - trimStart;
        const finalVideoData = {
            ...existingVideo,
            trimStart,
            trimEnd,
            duration: trimmedDuration,
            thumbnail: thumbnailFile ? URL.createObjectURL(thumbnailFile) : existingVideo.thumbnail
        };
        coachAPI.uploadVideoIntroduction(finalVideoData)
            .then(updatedCoachProfile => {
                setLocalVideoData(updatedCoachProfile.videoIntroduction);
                onVideoUpdate(updatedCoachProfile);
            })
            .catch(error => toast.error(t('coachprofile:errorUploadingVideo')))
            .finally(() => setIsVideoLoading(false));
        return;
    }

    if (videoFile) {
        const _tempId = `temp_${Date.now()}`;
        const optimisticThumbnailUrl = thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;
        
        setLocalVideoData({
            fileName: videoFile.name,
            thumbnail: optimisticThumbnailUrl,
            status: 'uploading',
            progress: 0,
            _tempId
        });

        backgroundUploader({
            videoFile,
            thumbnailFile,
            _tempId,
            trimStart,
            trimEnd,
            getSignatureFunc: getVideoIntroductionSignature,
            onProgress: (id, percent) => {
                setLocalVideoData(currentData => {
                    if (currentData?._tempId !== id) return currentData;
                    return { ...currentData, progress: percent };
                });
            },
            onComplete: (id, finalVideoData) => {
                coachAPI.uploadVideoIntroduction(finalVideoData)
                    .then(updatedCoachProfile => {
                        setLocalVideoData(updatedCoachProfile.videoIntroduction);
                        onVideoUpdate(updatedCoachProfile);
                    })
                    .catch(error => {
                        toast.error(t('coachprofile:errorUploadingVideo'));
                        setLocalVideoData(coach.videoIntroduction);
                    });
            },
            onFailure: (id, errorMsg) => {
                toast.error(t('coachprofile:errorUploadingVideo'));
                setLocalVideoData(coach.videoIntroduction);
            },
        });
    }
};

const handleVideoDelete = async () => {
    setIsVideoLoading(true);
    try {
      if (!localVideoData) {
        throw new Error("No video to delete.");
      }
      const updatedCoach = await coachAPI.deleteVideoIntroduction();
      setLocalVideoData(null);
      onVideoUpdate(updatedCoach);
      toast.success(t('coachprofile:videoDeleteSuccess'));
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error(t('coachprofile:errorDeletingVideo'));
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleBioUpdate = useCallback((newBio) => {
    if (!isOwnProfile) return;

    const originalBio = coach.bio;
    onItemsUpdate('bio', newBio); // Optimistically update the UI

    coachAPI.updateCoachProfile(coach.user._id, { bio: newBio })
      .then(updatedCoach => {
        toast.success(t('coachprofile:bioUpdated'));
      })
      .catch(error => {
        logger.error('[AboutTab] Error updating bio:', error);
        toast.error(t('coachprofile:updateError', { field: t('coachprofile:biography') }));
        // Revert UI on failure
        onItemsUpdate('bio', originalBio);
      });
  }, [coach, isOwnProfile, onItemsUpdate, t]);

  return (
    <div className="bg-card text-card-foreground border sm:rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium">{t('coachprofile:aboutMe')}</h3>
      </div>
      <div className="border-t border-border px-4 py-5 sm:p-0">
        <dl className="sm:divide-y sm:divide-border">

          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Video className="mr-2 h-5 w-5" />
              {t('coachprofile:videoIntroduction')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
    {isVideoLoading ? (
    <div className="flex justify-center items-center h-full min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
    ) : localVideoData ? (
    <div className="relative w-full max-w-2xl group">
        {localVideoData?.status === 'uploading' ? (
        <div className="relative w-full aspect-video rounded-lg bg-black">
            <img src={localVideoData.thumbnail} alt="Uploading video" className="absolute inset-0 w-full h-full object-cover rounded-lg opacity-30 blur-sm" />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 p-4">
                <Progress value={localVideoData.progress} variant="on-dark" className="h-1.5 w-full max-w-xs bg-white/30" />
            </div>
        </div>
        ) : (
         <CustomVideoPlayer
            videoFile={localVideoData}
        />
        )}
        {isOwnProfile && localVideoData?.status !== 'uploading' && (
        <div className="absolute top-2 right-2 z-20 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setShowVideoEditor(true)}>
            <Edit className="h-4 w-4" />
            </Button>
            <Button variant="delete-destructive" size="icon" className="h-8 w-8" onClick={handleVideoDelete}>
            <Trash2 className="h-4 w-4" />
            </Button>
        </div>
        )}
    </div>
    ) : isOwnProfile && (
    <Button onClick={() => setShowVideoEditor(true)}>
        <Upload className="mr-2 h-5 w-5" />
        {t('coachprofile:uploadVideoIntroduction')}
    </Button>
    )}
</dd>
          </div>

          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <User className="mr-2 h-5 w-5" />
              {t('coachprofile:biography')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
               <AboutTabBio
                bio={coach.bio}
                isOwnProfile={isOwnProfile}
                onUpdate={handleBioUpdate}
              />
            </dd>
          </div>

         {/* Specialties Section */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Award className="mr-2 h-5 w-5" />
              {t('coachprofile:specialties')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
              <SearchableListSelector
                listType="specialties"
                selectedItems={coach.specialties || []}
                onUpdate={useCallback((updatedItems) => handleListUpdate('specialties', updatedItems), [handleListUpdate])}
                isEditable={isOwnProfile}
              />
            </dd>
          </div>

          {/* Education Levels Section */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Book className="mr-2 h-5 w-5" />
              {t('coachprofile:educationLevels')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
              <SearchableListSelector
                listType="educationLevels"
                selectedItems={coach.educationLevels || []}
                onUpdate={useCallback((updatedItems) => handleListUpdate('educationLevels', updatedItems), [handleListUpdate])}
                isEditable={isOwnProfile}
              />
            </dd>
          </div>

          {/* Languages Section */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Globe className="mr-2 h-5 w-5" />
              {t('coachprofile:languages')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
              <SearchableListSelector
                listType="languages"
                selectedItems={coach.languages || []}
                onUpdate={useCallback((updatedItems) => handleListUpdate('languages', updatedItems), [handleListUpdate])}
                isEditable={isOwnProfile}
              />
            </dd>
          </div>

          {/* Coaching Styles Section */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Briefcase className="mr-2 h-5 w-5" />
              {t('coachprofile:coachingStyles')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
              <SearchableListSelector
                listType="coachingStyles"
                selectedItems={coach.coachingStyles || []}
                onUpdate={useCallback((updatedItems) => handleListUpdate('coachingStyles', updatedItems), [handleListUpdate])}
                isEditable={isOwnProfile}
              />
            </dd>
          </div>

         {/* Skills Section */}
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground flex items-center">
              <Award className="mr-2 h-5 w-5" />
              {t('coachprofile:skills')}
            </dt>
            <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
               <SearchableListSelector
                listType="skills"
                selectedItems={coach.skills || []}
                onUpdate={useCallback((updatedItems) => handleListUpdate('skills', updatedItems), [handleListUpdate])}
                isEditable={isOwnProfile}
              />
            </dd>
          </div>

          {coach?.settings?.insuranceRecognition?.isRecognized && (
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted-foreground flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5" />
                {t('coachprofile:insurance.title')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="ml-2 h-4 w-4 cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">{t('coachprofile:insurance.disclaimerTitle')}</p>
                      <p>{t('coachprofile:insurance.disclaimerText')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                <div className="relative group">
                  <div className="p-4 border rounded-lg bg-card">
                    <p className="font-semibold text-card-foreground mb-2">{t('coachprofile:insurance.registries')}</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {coach.settings.insuranceRecognition.registries.map((reg, index) => (
                        <li key={index} className="flex items-center">
                          <span className="font-medium text-foreground">{reg.name}</span>
                          {reg.therapistId && ` (${reg.therapistId})`}
                          {reg.status === 'verified' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ShieldCheck className="h-4 w-4 text-green-600 ml-2" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Platform Verified until {format(new Date(reg.expiryDate), 'MMM yyyy')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {isOwnProfile && (
                    <Button
                      onClick={onEditInsurance}
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {t('common:edit')}
                    </Button>
                  )}
                </div>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {isEditing && (
        <div className="px-4 py-3 bg-muted/50 text-right sm:px-6 border-t border-border">
          <Button onClick={onCancel} variant="outline" className="mr-3">
            {t('common:cancel')}
          </Button>
          <Button onClick={onSave}>
            {t('coachprofile:saveChanges')}
          </Button>
        </div>
      )}
       {showVideoEditor && (
        <VideoEditorModal
          onUpload={handleVideoUpload}
          onClose={() => setShowVideoEditor(false)}
          existingVideo={localVideoData}
        />
      )}
    </div>
  );
};

export default AboutTab;