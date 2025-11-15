import React, { useState, useMemo  } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation, Trans } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '../../ui/button.tsx';
import { Progress } from '../../ui/progress.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../ui/card.tsx';

import { saveOnboardingData, updateOnboardingStep } from '../../../services/userAPI';
import Step1PrimaryGoal from './Step1PrimaryGoal';
import Step2Interests from './Step2Interests';
import Step3InteractionStyle from './Step3InteractionStyle';
import { logger } from '../../../utils/logger';

const TOTAL_STEPS = 3; // Updated total steps from 5 to 3

const ClientOnboardingPage = () => {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Updated state to only include data from steps 1-3
  const [onboardingData, setOnboardingData] = useState({
    primaryGoal: [],
    coachingNeeds: [],
    preferredLearningStyle: '',
  });

  const stepDetails = useMemo(
    () => ({
      1: { title: t('step1.title'), description: t('step1.description') },
      2: { title: t('step2.title'), description: t('step2.description') },
      3: { title: t('step3.title'), description: t('step3.description') },
      // Removed steps 4 and 5
    }),
    [t]
  );

const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      logger.info(`[ClientOnboarding] Saving progress. Completed step: ${currentStep}`);
      updateOnboardingStep({ role: 'client', lastStep: `step-${currentStep}` }).catch(error => {
        logger.warn('Silent failure: Could not save onboarding step progress', error);
      });
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    // Navigate to the main dashboard or home page
    navigate('/dashboard');
  };

const handleFinish = async () => {
    setIsLoading(true);
    logger.info('[ClientOnboarding] Finishing onboarding with data:', onboardingData);
    try {
      await saveOnboardingData(onboardingData);
      logger.info('[ClientOnboarding] Onboarding data saved successfully.');

      // --- Smart Redirection Logic ---
      const { primaryGoal, preferredLearningStyle, coachingNeeds } = onboardingData;
      const specialtiesQuery = coachingNeeds.map((item) => item.id).join(',');

      // Corrected logic to check if primaryGoal array includes a value
      if (primaryGoal.includes('programs') || preferredLearningStyle === 'self_paced') {
        const params = new URLSearchParams();
        if (specialtiesQuery) params.append('categories', specialtiesQuery);
        // Removed experienceLevel from params
        navigate(`/programs?${params.toString()}`);
      } else if (primaryGoal.includes('one_on_one')) {
        const params = new URLSearchParams();
        if (specialtiesQuery) params.append('specialties', specialtiesQuery);
        if (preferredLearningStyle === 'live') params.append('liveSessionAvailable', 'true');
        navigate(`/coaches?${params.toString()}`);
      } else {
        // Default for 'exploring' or other cases
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Submission failed:', error);
      toast.error(t('common.errorSubmitting', 'Failed to save preferences. Please try again.'));
      setIsLoading(false);
    }
  };

  const handleGoalToggle = (goalId) => {
  setOnboardingData((prevData) => {
    const currentGoals = prevData.primaryGoal;
    const newGoals = currentGoals.includes(goalId)
      ? currentGoals.filter((id) => id !== goalId) // Remove if exists
      : [...currentGoals, goalId]; // Add if doesn't exist
    return { ...prevData, primaryGoal: newGoals };
  });
};

  const isStepComplete = useMemo(() => {
  switch (currentStep) {
    case 1:
      return onboardingData.primaryGoal.length > 0;
      case 2:
        return true; // Interests are optional
      case 3:
        return !!onboardingData.preferredLearningStyle;
      // Removed cases for steps 4 and 5
      default:
        return false;
    }
  }, [currentStep, onboardingData]);

 const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1PrimaryGoal
            value={onboardingData.primaryGoal}
            onToggle={handleGoalToggle} 
          />
        );
      case 2:
        return (
          <Step2Interests
            value={onboardingData.coachingNeeds}
            onUpdate={(items) => setOnboardingData({ ...onboardingData, coachingNeeds: items })}
          />
        );
      case 3:
        return (
          <Step3InteractionStyle
            value={onboardingData.preferredLearningStyle}
            onSelect={(value) => setOnboardingData({ ...onboardingData, preferredLearningStyle: value })}
          />
        );
      // Removed rendering for steps 4 and 5
      default:
        return null;
    }
  };

  return (
   <div className="flex h-full w-full items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {t('common.step', { current: currentStep, total: TOTAL_STEPS })}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              {t('common.skip')}
            </Button>
          </div>
          <Progress value={(currentStep / TOTAL_STEPS) * 100} className="mb-4" />
          <CardTitle className="text-2xl md:text-3xl">{stepDetails[currentStep]?.title}</CardTitle>
          <CardDescription>{stepDetails[currentStep]?.description}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">{renderStepContent()}</CardContent>
        <CardFooter className="flex justify-between">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
              </Button>
            )}
          </div>
          <div>
            {currentStep < TOTAL_STEPS ? (
              <Button onClick={handleNext} disabled={!isStepComplete}>
                {t('common.next')}
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={isLoading || !isStepComplete}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.finishing')}
                  </>
                ) : (
                  t('common.finish')
                )}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ClientOnboardingPage;