import React, { useState, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { getCoachProfile, updateCoachProfile, updateCoachSettings } from '../../../services/coachAPI';
import { getPriceConfiguration, updateBaseRate, updateLiveSessionRate } from '../../../services/priceAPI';
import { updateOnboardingStep } from '../../../services/userAPI';
import { logger } from '../../../utils/logger';

import { Button } from '../../ui/button.tsx';
import { Progress } from '../../ui/progress.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../ui/card.tsx';

import Step1Essentials from './Step1Essentials';
import Step2Expertise from './Step2Expertise';
import Step3Credentials from './Step3Credentials';
import Step4Services from './Step4Services';
import Step6Publish from './Step6Publish';

const TOTAL_STEPS = 5;

// This function deeply compares two lists to see if they are semantically equal.
const areItemListsEqual = (listA, listB, listType) => {
    if (!Array.isArray(listA) || !Array.isArray(listB) || listA.length !== listB.length) {
        return false;
    }

    // Normalize items to a consistent format (ID and strength for languages) for comparison
    const normalizeItem = (item) => {
        if (!item) return null;
        if (listType === 'languages') {
            const id = item._id; // In onboarding, the structure is simpler
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

const calculateProfileStrength = (data) => {
    let score = 0;
    const scoreBreakdown = {};

    const hasProfilePicture = !!data?.profilePicture?.url;
    if (hasProfilePicture) score += 20;
    scoreBreakdown.profilePicture = hasProfilePicture ? 20 : 0;

    const hasHeadline = data.headline?.length > 0;
    if (hasHeadline) score += 15;
    scoreBreakdown.headline = hasHeadline ? 15 : 0;
    
    const hasBio = data.bio?.length > 0 && data.bio.some(b => b.content?.length > 0);
    if (hasBio) score += 15;
    scoreBreakdown.bio = hasBio ? 15 : 0;

    const hasSpecialties = data.specialties?.length > 0;
    if (hasSpecialties) score += 15;
    scoreBreakdown.specialties = hasSpecialties ? 15 : 0;

    const hasSkills = data.skills?.length > 0;
    if (hasSkills) score += 10;
    scoreBreakdown.skills = hasSkills ? 10 : 0;
    
    const hasCredentials = data.educationLevels?.length > 0 || data.coachingStyles?.length > 0;
    if (hasCredentials) score += 10;
    scoreBreakdown.credentials = hasCredentials ? 10 : 0;
    
    const hasLanguages = data.languages?.length > 0;
    if (hasLanguages) score += 5;
    scoreBreakdown.languages = hasLanguages ? 5 : 0;

    const hasBaseRate = data.baseRate?.amount > 0;
    if (hasBaseRate) score += 10;
    scoreBreakdown.baseRate = hasBaseRate ? 10 : 0;
    
    return { score: Math.min(score, 100), breakdown: scoreBreakdown };
};

const CoachOnboardingStudio = () => {
  const { t } = useTranslation(['onboarding', 'common']);
  const navigate = useNavigate();
  const { id: userId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();

  const getInitialStep = () => {
    const params = new URLSearchParams(location.search);
    if (params.get('step') === 'final') {
      return TOTAL_STEPS;
    }
    return 1;
  };

  const [currentStep, setCurrentStep] = useState(getInitialStep);
  const [onboardingData, setOnboardingData] = useState({
      headline: '',
      specialties: [],
      skills: [],
      languages: [],
      bio: [],
      educationLevels: [],
      coachingStyles: [],
      baseRate: { amount: 50, currency: 'CHF' },
      liveSessionRate: { amount: 2, currency: 'CHF' },
      profilePicture: null,
      user: {},
    }); 
  const [dirtyFields, setDirtyFields] = useState(new Set());

  const saveDirtyFields = () => {
    if (!dirtyFields.has('bio')) {
      return;
    }
    
    logger.info(`[CoachOnboarding] Saving bio field.`);
    const bioData = onboardingData.bio;
    updateMutation.mutate({ profileData: { bio: bioData } });
    setDirtyFields(new Set());
  };

  const { data: initialData, isLoading: isLoadingProfile } = useQuery(
    ['coachOnboardingProfile', userId],
    async () => {
      const profile = await getCoachProfile(userId);
      let prices = null;
      try {
        prices = await getPriceConfiguration(userId);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          logger.warn(`[Onboarding] Price configuration not found for new coach ${userId}. Using defaults.`);
        } else {
          throw error;
        }
      }
      return { profile, prices };
    },
    {
      enabled: !!userId,
      onSuccess: ({ profile, prices }) => {
        setOnboardingData(prev => ({
          ...prev,
          headline: profile.headline || '',
          specialties: profile.specialties || [],
          skills: profile.skills || [],
          languages: profile.languages || [],
          bio: profile.bio || [],
          educationLevels: profile.educationLevels || [],
          coachingStyles: profile.coachingStyles || [],
          baseRate: prices?.baseRate || { amount: 50, currency: 'CHF' },
          liveSessionRate: prices?.liveSessionRate || { amount: 2, currency: 'CHF' },
          profilePicture: profile.profilePicture || null,
          user: profile.user || {},
        }));
      },
    }
  );

const updateMutation = useMutation(
    (payload) => {
        if (payload.action === 'updateBaseRate') {
            return updateBaseRate(userId, payload.data);
        }
        if (payload.action === 'updateLiveSessionRate') {
            return updateLiveSessionRate(userId, payload.data);
        }
        if (payload.settings) {
            return updateCoachSettings(userId, { settings: payload.settings });
        }
        return updateCoachProfile(userId, payload.profileData);
    },
    {
      onError: (error) => {
        toast.error(t('common:errorSubmitting', 'Failed to save progress.'));
      },
      onSuccess: () => {
        //toast.success(t('common:progressSaved', 'Progress saved!'));
        queryClient.invalidateQueries(['coachOnboardingProfile', userId]);
      }
    }
  );

const stepDetails = useMemo(() => ({
    1: { title: t('step1c.title'), description: t('step1c.description') },
    2: { title: t('step2c.title'), description: t('step2c.description') },
    3: { title: t('step3c.title'), description: t('step3c.description') },
    4: { title: t('step4c.title'), description: t('step4c.description') },
    5: { title: t('step6c.title'), description: t('step6c.description') },
  }), [t]);

const handleNext = () => {
    const { score, breakdown } = calculateProfileStrength(onboardingData);
    console.log(`[ProfileStrength] 'Next' clicked. Current score: ${score}%`, { breakdown });
    
    saveDirtyFields();
    if (currentStep < TOTAL_STEPS) {
      logger.info(`[CoachOnboarding] Saving progress. Completed step: ${currentStep}`);
      updateOnboardingStep({ role: 'coach', lastStep: `step-${currentStep}`}).catch(error => {
          logger.warn('Silent failure: Could not save coach onboarding step progress', error);
      });
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    saveDirtyFields();
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleSkip = () => {
  if (currentStep < TOTAL_STEPS) {
    handleNext();
  }
};

const handlePublish = async () => {
    logger.info(`[CoachOnboarding] Publishing profile for user ID: ${userId}`);
    updateMutation.mutate({ profileData: { status: 'active' } }, {
        onSuccess: () => {
            logger.info(`[CoachOnboarding] Profile published successfully for user ID: ${userId}`);
            navigate(`/coach-profile/${userId}`);
        },
        onError: (error) => {
            logger.error(`[CoachOnboarding] Failed to publish profile for user ID: ${userId}`, error);
        }
    });
  };
  
const handleUpdate = (field, value) => {
    if (field === 'profileUpdate') {
      setOnboardingData(prevData => ({
        ...prevData,
        ...value,
        profilePicture: value.profilePicture || null,
      }));
      return;
    }

    if (field === 'bio') {
      setOnboardingData(prevData => ({ ...prevData, [field]: value }));
      setDirtyFields(prev => new Set(prev).add('bio'));
      return;
    }

    const listFields = ['specialties', 'skills', 'languages', 'educationLevels', 'coachingStyles'];
    if (listFields.includes(field)) {
      const originalItems = onboardingData[field] || [];
      if (areItemListsEqual(originalItems, value, field)) {
        logger.info(`[Onboarding] Skipping redundant update for list: ${field}.`);
        return;
      }
    }
    
    setOnboardingData(prevData => ({ ...prevData, [field]: value }));

    if (field === 'baseRate') {
      updateMutation.mutate({ action: 'updateBaseRate', data: value });
    } else if (field === 'liveSessionRate') {
      updateMutation.mutate({ action: 'updateLiveSessionRate', data: value });
    } else {
      let payloadValue = value;

      if (field === 'languages') {
        payloadValue = value.map(lang => ({
          language: lang._id,
          strength: 'intermediate'
        }));
      }
      
      const profileData = { [field]: payloadValue };
      if (dirtyFields.has('bio')) {
        profileData.bio = onboardingData.bio;
        setDirtyFields(prev => {
            const newDirtyFields = new Set(prev);
            newDirtyFields.delete('bio');
            return newDirtyFields;
        });
      }
      updateMutation.mutate({ profileData });
    }
  };
  
const profileStrength = useMemo(() => {
    const { score, breakdown } = calculateProfileStrength(onboardingData);
    console.log(`[ProfileStrength] UI Updated. Score: ${score}%`, { breakdown });
    return score;
  }, [onboardingData]);

const renderStepContent = () => {
    if (isLoadingProfile) return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    
    switch (currentStep) {
      case 1: return <Step1Essentials 
          userId={userId} 
          headline={onboardingData.headline} 
          onUpdate={handleUpdate} 
          profilePictureUrl={onboardingData.profilePicture?.url}
          firstName={onboardingData.user?.firstName}
          lastName={onboardingData.user?.lastName}
        />;
      case 2: return <Step2Expertise data={onboardingData} onUpdate={handleUpdate} />;
      case 3: return <Step3Credentials data={onboardingData} onUpdate={handleUpdate} />;
      case 4: return <Step4Services data={onboardingData} onUpdate={handleUpdate} />;
      case 5: return <Step6Publish coach={initialData?.profile} />;
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="mb-4 flex items-center justify-between">
             <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                <span>{t('profileStrength')}: {profileStrength}%</span>
            </div>
            {currentStep < TOTAL_STEPS && (
                <Button variant="ghost" size="sm" onClick={handleSkip}>{t('common:skipForNow')}</Button>
              )}
          </div>
          <Progress value={profileStrength} className="mb-4" />
          <CardTitle className="text-2xl md:text-3xl">{stepDetails[currentStep]?.title}</CardTitle>
          <CardDescription>{stepDetails[currentStep]?.description}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[350px]">
            {renderStepContent()}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={updateMutation.isLoading}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {t('common:back')}
              </Button>
            )}
          </div>
          <div>
            {currentStep < TOTAL_STEPS && (
              <Button onClick={handleNext} disabled={updateMutation.isLoading}>
                {updateMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('common:next')}
              </Button>
            )}
            {currentStep === TOTAL_STEPS && (
              <Button size="lg" onClick={handlePublish} disabled={updateMutation.isLoading}>
                {updateMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('onboarding:step6c.publishButton')}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default CoachOnboardingStudio;