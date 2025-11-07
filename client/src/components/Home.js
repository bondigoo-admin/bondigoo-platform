import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import {
  Users, UserPlus, Calendar, TrendingUp, CreditCard, Sparkles,
  Video, BookOpen, MessageCircle, PlayCircle,
  LayoutDashboard, UserCircle, User, Briefcase, ArrowRight, CheckCircle
} from 'lucide-react';
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "./ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog.tsx';
import { useAuth } from '../contexts/AuthContext';
import { useMounted } from '../hooks/useMounted';
import CoachCard from './CoachCard';
import LiveSessionClientRequestModal from './LiveSessionClientRequestModal';
import LiveSessionWaitingRoom from './LiveSessionWaitingRoom';
import { useLiveSession } from '../contexts/LiveSessionContext';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import FeaturedPrograms from './FeaturedPrograms';
import ShapeDivider from './layouts/ShapeDivider';
import LeadCaptureForm from './shared/LeadCaptureForm';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } }
};

const gradientAnimation = {
    initial: {
        backgroundPosition: '0% 50%',
    },
    animate: {
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        transition: {
            duration: 15,
            ease: 'linear',
            repeat: Infinity, 
        }
    }
};

const PreLaunchFeatureCard = ({ icon, title, description }) => (
    <motion.div variants={fadeInUp}> <Card className="h-full text-center transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl dark:bg-card"> <CardHeader className="items-center pb-4"> <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"> {React.cloneElement(icon, { className: "h-10 w-10 text-primary" })} </div> </CardHeader> <CardContent> <h3 className="text-xl font-bold">{title}</h3> <p className="mt-2 text-muted-foreground">{description}</p> </CardContent> </Card> </motion.div>
);
PreLaunchFeatureCard.propTypes = { icon: PropTypes.element.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired };

const CoachApplicationModal = ({ isOpen, onOpenChange, onSuccess }) => {
    const { t } = useTranslation('signup');

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-3xl font-bold text-center">{t('coach.application.pageTitle')}</DialogTitle>
                    <DialogDescription className="max-w-2xl mx-auto text-center pt-2">
                        {t('coach.application.pageSubtitle')}
                    </DialogDescription>
                </DialogHeader>
                <div className="pt-4 max-h-[70vh] overflow-y-auto pr-2">
                    <LeadCaptureForm userType="coach" onSuccess={onSuccess} />
                </div>
            </DialogContent>
        </Dialog>
    );
};
CoachApplicationModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onOpenChange: PropTypes.func.isRequired,
    onSuccess: PropTypes.func,
};

const LaunchSignupModal = ({ isOpen, onOpenChange, onApplyCoachClick }) => {
    const { t } = useTranslation(['home', 'signup']);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl grid-cols-1 md:grid-cols-2 gap-8 p-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>{t('prelaunch.hero.mainCta', 'Join Our Launch')}</DialogTitle>
                    <DialogDescription>{t('prelaunch.cta.client.desc')}</DialogDescription>
                </DialogHeader>
                <div className="p-8 flex flex-col">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                        <Users className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{t('prelaunch.cta.client.title')}</h3>
                    <p className="text-muted-foreground mb-6">{t('prelaunch.cta.client.desc')}</p>
                    <div className="mt-auto">
                      <LeadCaptureForm userType="client" />
                    </div>
                </div>
                <div className="p-8 bg-muted/50 flex flex-col rounded-r-lg">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                        <Briefcase className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{t('prelaunch.cta.coach.title')}</h3>
                    <p className="text-muted-foreground mb-6">{t('prelaunch.cta.coach.desc')}</p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                        <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" /><span>{t('signup:coach.application.benefit1', 'No platform fees for the first year')}</span></li>
                        <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" /><span>{t('signup:coach.application.benefit2', 'Direct input on new features')}</span></li>
                        <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" /><span>{t('signup:coach.application.benefit3', 'Featured placement at launch')}</span></li>
                    </ul>
                    <Button onClick={onApplyCoachClick} size="lg" className="w-full mt-auto">
                        {t('finalCta.form.ctaCoach', 'Apply for Early Access')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
LaunchSignupModal.propTypes = { 
    isOpen: PropTypes.bool.isRequired, 
    onOpenChange: PropTypes.func.isRequired,
    onApplyCoachClick: PropTypes.func.isRequired 
};

const PreLaunchHome = () => {
    const { t } = useTranslation('home');
    const mounted = useMounted();
    const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
    const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

    const handleApplyCoachClick = () => {
        setIsSignupModalOpen(false);
        setIsCoachModalOpen(true);
    };

    return (
        <div className="flex flex-col bg-transparent">
            <LaunchSignupModal isOpen={isSignupModalOpen} onOpenChange={setIsSignupModalOpen} onApplyCoachClick={handleApplyCoachClick} />
            <CoachApplicationModal isOpen={isCoachModalOpen} onOpenChange={setIsCoachModalOpen} onSuccess={() => setIsCoachModalOpen(false)} />
            <motion.section 
                id="prelaunch-hero" 
                className="relative text-center text-primary-foreground dark:text-foreground overflow-hidden bg-gradient-animated bg-size-400"
                variants={gradientAnimation}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
              >
                <div className="relative isolate container mx-auto px-4 py-32 sm:py-40 lg:py-72">
                    <motion.div className="mx-auto max-w-4xl" initial="hidden" animate={mounted ? "visible" : "hidden"} variants={staggerChildren}>
                        <motion.div className="mb-8 flex flex-col gap-1" variants={fadeInUp}>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line1')}</h1>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line2')}</h1>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line3')}</h1>
                        </motion.div>
                        <motion.div variants={fadeInUp} className="mx-auto mt-6 max-w-3xl">
                            <p className="text-xl leading-8 sm:text-2xl">{t('hero.subheading.main')}</p>
                            <p className="text-xl leading-8 sm:text-2xl">{t('hero.subheading.support')}</p>
                        </motion.div>
                        <motion.div className="mt-10 flex items-center justify-center" variants={fadeInUp}>
                            <Button size="lg" variant="hero" onClick={() => setIsSignupModalOpen(true)}>
                                {t('prelaunch.hero.mainCta', 'Join Our Launch')}
                            </Button>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.section>
            
            <div className="-mt-[100px] sm:-mt-[150px] lg:-mt-[200px] relative z-10">
                <ShapeDivider variants={fadeInUp} />
            </div>

             <div id="home-content-start" className="bg-background -translate-y-px">
                <motion.section className="py-20 sm:py-28" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerChildren}>
                    <div className="container mx-auto px-4">
                        <motion.h2 variants={fadeInUp} className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-12 md:mb-16">{t('features.title')}</motion.h2>
                        <motion.div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4" variants={staggerChildren}>
                            <PreLaunchFeatureCard icon={<Video />} title={t('features.cards.liveSessions.title')} description={t('features.cards.liveSessions.description')} />
                            <PreLaunchFeatureCard icon={<BookOpen />} title={t('features.cards.coachingPrograms.title')} description={t('features.cards.coachingPrograms.description')} />
                            <PreLaunchFeatureCard icon={<TrendingUp />} title={t('features.cards.interactiveLearning.title')} description={t('features.cards.interactiveLearning.description')} />
                            <PreLaunchFeatureCard icon={<Calendar />} title={t('features.cards.scheduling.title')} description={t('features.cards.scheduling.description')} />
                            <PreLaunchFeatureCard icon={<CreditCard />} title={t('features.cards.payments.title')} description={t('features.cards.payments.description')} />
                            <PreLaunchFeatureCard icon={<MessageCircle />} title={t('features.cards.messaging.title')} description={t('features.cards.messaging.description')} />
                            <PreLaunchFeatureCard icon={<LayoutDashboard />} title={t('features.cards.coachDashboard.title')} description={t('features.cards.coachDashboard.description')} />
                            <PreLaunchFeatureCard icon={<Users />} title={t('features.cards.clientManagement.title')} description={t('features.cards.clientManagement.description')} />
                        </motion.div>
                    </div>
                </motion.section>

                
            </div>
        </div>
    );
};

// --- LAUNCHED APPLICATION COMPONENTS ---

const SelectionCard = ({ icon, title, description, benefits, linkTo, ctaText }) => (
  <motion.div variants={fadeInUp} className="h-full">
    <Card className="flex h-full flex-col overflow-hidden border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-border">
      <CardHeader className="items-start">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          {React.cloneElement(icon, { className: "h-8 w-8 text-primary" })}
        </div>
        <CardTitle className="text-2xl font-bold">{title}</CardTitle>
        <CardDescription className="pt-1 text-base text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-3">
          {benefits.map((benefit, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckCircle className="mt-1 h-5 w-5 flex-shrink-0 text-green-500" />
              <span className="text-muted-foreground">{benefit}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full group" size="lg">
          <Link to={linkTo} className="flex items-center justify-center">
            {ctaText}
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  </motion.div>
);
SelectionCard.propTypes = { icon: PropTypes.element.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, benefits: PropTypes.arrayOf(PropTypes.string).isRequired, linkTo: PropTypes.string.isRequired, ctaText: PropTypes.string.isRequired };

const LaunchedFeatureCard = ({ icon, title, description }) => ( <motion.div variants={fadeInUp}> <Card className="h-full text-center transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl dark:bg-card"> <CardHeader className="items-center pb-4"> <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"> {React.cloneElement(icon, { className: "h-10 w-10 text-primary" })} </div> </CardHeader> <CardContent> <h3 className="text-xl font-bold">{title}</h3> <p className="mt-2 text-muted-foreground">{description}</p> </CardContent> </Card> </motion.div> );
LaunchedFeatureCard.propTypes = { icon: PropTypes.element.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired };

const TestimonialCard = ({ quote, author, role }) => ( <motion.div variants={fadeInUp} className="h-full"> <Card className="flex h-full flex-col transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl dark:bg-card"> <CardContent className="flex flex-grow flex-col p-6"> <blockquote className="mb-auto text-lg italic text-foreground">“{quote}”</blockquote> <footer className="mt-4"> <p className="font-bold text-foreground">{author}</p> <p className="text-sm text-primary">{role}</p> </footer> </CardContent> </Card> </motion.div> );
TestimonialCard.propTypes = { quote: PropTypes.string.isRequired, author: PropTypes.string.isRequired, role: PropTypes.string.isRequired };

const SummaryStep = ({ icon, title, description }) => {
  const Icon = icon;
  return (
    <motion.div variants={fadeInUp} className="flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-muted-foreground">{description}</p>
    </motion.div>
  );
};
SummaryStep.propTypes = { icon: PropTypes.elementType.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired };

const FeaturedCoachesSection = ({ onInitiateRequest }) => {
    const { t } = useTranslation('home');
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    
    const { data: coaches, isLoading, isError } = useQuery('featuredCoaches', async () => {
        const { data } = await axios.get('/api/coaches/featured');
        return data;
    }, { staleTime: 5 * 60 * 1000 });

    if (isLoading || isError || !coaches || coaches.length === 0) {
        return null;
    }

    return (
        <div className="container mx-auto px-4">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('featuredCoaches.title', 'Meet Our Featured Coaches')}</h2>
                <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">{t('featuredCoaches.subtitle', 'Handpicked experts to guide you on your journey.')}</p>
            </div>
            <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" variants={staggerChildren}>
                {coaches.map((coach) => (
                    <motion.div key={coach.user._id} variants={fadeInUp}>
                        <CoachCard coach={coach} isAuthenticated={isAuthenticated} onInitiateRequest={onInitiateRequest} status={coach.user?.status} />
                    </motion.div>
                ))}
            </motion.div>
            <div className="text-center mt-12">
                <Button size="lg" onClick={() => navigate('/coaches')}>
                    {t('featuredCoaches.exploreAll', 'Explore All Coaches')}
                </Button>
            </div>
        </div>
    );
};
FeaturedCoachesSection.propTypes = { onInitiateRequest: PropTypes.func.isRequired };

const LaunchedHome = () => {
  const { t } = useTranslation(['home', 'pageTitles']);
  const { t: tSignup } = useTranslation('signup');
  const { isAuthenticated, user, userRole } = useAuth();
  const mounted = useMounted();
  const { requestLiveSession, outgoingRequestStatus, sessionId, sessionInfo, cancelLiveSessionRequest, resetOutgoingRequest } = useLiveSession();
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isWaitingRoomOpen, setIsWaitingRoomOpen] = useState(false);

  useEffect(() => {
  document.title = t('pageTitles:home', 'Coaching Platform for Growth - Bondigoo');
}, [t]);
  
  const handleInitiateRequest = useCallback((coachForRequest) => {
    if (!isAuthenticated) {
        toast.error('Please log in to start a live session.');
        return;
    }
    setSelectedCoach(coachForRequest);
    setIsRequestModalOpen(true);
  }, [isAuthenticated]);

  const handleConfirmRequest = useCallback(async (payload) => {
    try {
        await requestLiveSession(payload);
        setIsRequestModalOpen(false);
    } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to request live session.');
        logger.error('[Home] Failed to request live session', error);
    }
  }, [requestLiveSession]);

  useEffect(() => {
    if (outgoingRequestStatus === 'pending' || outgoingRequestStatus === 'accepted') {
        setIsWaitingRoomOpen(true);
    } else if (outgoingRequestStatus === 'declined' || outgoingRequestStatus === 'cancelled') {
        const timer = setTimeout(() => {
            setIsWaitingRoomOpen(false);
            resetOutgoingRequest();
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [outgoingRequestStatus, resetOutgoingRequest]);

  const handleCloseWaitingRoom = useCallback(() => {
    setIsWaitingRoomOpen(false);
    resetOutgoingRequest();
  }, [resetOutgoingRequest]);

  const handleCancelLiveRequest = useCallback(async () => {
    try {
      await cancelLiveSessionRequest();
    } catch (error) {
      logger.error('[Home] Error while calling cancelLiveSessionRequest API', error);
      toast.error('Failed to cancel request.');
    } finally {
      handleCloseWaitingRoom();
    }
  }, [cancelLiveSessionRequest, handleCloseWaitingRoom]);

  const isCoach = isAuthenticated && userRole === 'coach';

  return (
    <div className="flex flex-col bg-transparent">
      {selectedCoach && ( <LiveSessionClientRequestModal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} coach={selectedCoach} onConfirmRequest={handleConfirmRequest} /> )}
      {selectedCoach && user && ( <LiveSessionWaitingRoom isOpen={isWaitingRoomOpen} onClose={handleCloseWaitingRoom} coach={selectedCoach} user={user} sessionId={sessionId} onCancelRequest={handleCancelLiveRequest} status={outgoingRequestStatus} declineMessage={sessionInfo?.declineMessage} skipDeviceCheck={true} /> )}
      <motion.section 
          className="relative text-center text-primary-foreground dark:text-foreground overflow-hidden bg-gradient-animated bg-size-400"
          variants={gradientAnimation}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
        <div className="relative isolate container mx-auto px-4 py-32 sm:py-40 lg:py-72">
          <motion.div className="mx-auto max-w-4xl" initial="hidden" animate={mounted ? "visible" : "hidden"} variants={staggerChildren} >
            <motion.div className="mb-8 flex flex-col gap-1" variants={fadeInUp}>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line1')}</h1>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line2')}</h1>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t('hero.mainTitle.line3')}</h1>
            </motion.div>
            <motion.div variants={fadeInUp} className="mx-auto mt-6 max-w-3xl">
              <p className="text-xl leading-8 sm:text-2xl">{t('hero.subheading.main')}</p>
              <p className="mt-4 text-lg leading-7 text-primary-foreground/80">{t('hero.subheading.support')}</p>
           </motion.div>
           <motion.div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap sm:items-center" variants={fadeInUp} >
              {isCoach ? (
                <>
                  <Button asChild size="lg" variant="hero" className="w-full sm:w-auto"><Link to="/dashboard"><LayoutDashboard className="mr-2 h-5 w-5" /> {t('hero.buttons.goToDashboard')}</Link></Button>
                  <Button asChild size="lg" variant="hero" className="w-full sm:w-auto"><Link to="/profile"><UserCircle className="mr-2 h-5 w-5" /> {t('hero.buttons.myProfile')}</Link></Button>
                </>
              ) : (
                <>
                  {!isAuthenticated && (<Button asChild size="lg" variant="hero" className="w-full sm:w-auto"><Link to="/signup"><UserPlus className="mr-2 h-5 w-5" /> {t('hero.buttons.beginJourney')}</Link></Button>)}
                  <Button asChild size="lg" variant="hero" className="w-full sm:w-auto"><Link to="/coach-signup"><PlayCircle className="mr-2 h-5 w-5" /> {t('hero.buttons.becomeCoach')}</Link></Button>
                </>
              )}
            </motion.div>
          </motion.div>
        </div>
      </motion.section>
      <div className="-mt-[100px] sm:-mt-[150px] lg:-mt-[200px] relative z-10">
        <ShapeDivider variants={fadeInUp} />
      </div>
      <div className="bg-background -translate-y-px">
        {!isAuthenticated && (
          <motion.section className="pt-16 sm:pt-20 pb-20 sm:pb-28 bg-gradient-subtle" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerChildren}>
            <div className="container mx-auto px-4">
              <motion.div variants={fadeInUp} className="text-center mb-12 md:mb-16">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{tSignup('selection.title', 'Join Our Community')}</h2>
                <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">{tSignup('selection.subtitle', 'Choose your path and start your journey with us today.')}</p>
              </motion.div>
              <motion.div className="mx-auto grid max-w-md grid-cols-1 gap-8 md:max-w-4xl md:grid-cols-2" variants={staggerChildren}>
                <SelectionCard icon={<User />} title={tSignup('selection.client.title', 'I want to find a Coach')} description={tSignup('selection.client.description', 'For individuals seeking to unlock their potential.')} benefits={[ tSignup('selection.client.benefit1', 'Connect instantly with Live Sessions'), tSignup('selection.client.benefit2', 'Track progress on your personal dashboard'), tSignup('selection.client.benefit3', 'Learn on-demand with structured Programs'), ]} linkTo="/client-signup" ctaText={tSignup('selection.client.cta', 'Start as a Client')} />
                <SelectionCard icon={<Briefcase />} title={tSignup('selection.coach.title', 'I want to be a Coach')} description={tSignup('selection.coach.description', 'For professionals looking to grow their coaching business.')} benefits={[ tSignup('selection.coach.benefit1', 'Reach a global audience of clients'), tSignup('selection.coach.benefit2', 'Sell scalable digital Programs'), tSignup('selection.coach.benefit3', 'Offer instant on-demand Live Sessions'), ]} linkTo="/coach-signup" ctaText={tSignup('selection.coach.cta', 'Start as a Coach')} />
              </motion.div>
            </div>
          </motion.section>
        )}
        <section className="py-20 sm:py-28"> <FeaturedCoachesSection onInitiateRequest={handleInitiateRequest} /> </section>
        <FeaturedPrograms />
        <motion.section className="py-20 sm:py-28" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerChildren}>
          <div className="container mx-auto px-4 text-center">
            <motion.h2 variants={fadeInUp} className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('howItWorksSummary.title')}</motion.h2>
            <motion.p variants={fadeInUp} className="mt-4 max-w-3xl mx-auto text-lg text-muted-foreground">{t('howItWorksSummary.subtitle')}</motion.p>
            <motion.div className="mt-16 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-3" variants={staggerChildren}>
              <SummaryStep icon={UserPlus} title={t('howItWorksSummary.steps.step1.title')} description={t('howItWorksSummary.steps.step1.description')} />
              <SummaryStep icon={Users} title={t('howItWorksSummary.steps.step2.title')} description={t('howItWorksSummary.steps.step2.description')} />
              <SummaryStep icon={TrendingUp} title={t('howItWorksSummary.steps.step3.title')} description={t('howItWorksSummary.steps.step3.description')} />
            </motion.div>
            <motion.div variants={fadeInUp} className="mt-16">
              <Button asChild size="lg" variant="outline">
                <Link to="/how-it-works">{t('howItWorksSummary.cta')}<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </motion.div>
          </div>
        </motion.section>
       <motion.section className="py-20 sm:py-28" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerChildren}>
          <div className="container mx-auto px-4">
            <motion.h2 variants={fadeInUp} className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-12 md:mb-16">{t('features.title')}</motion.h2>
            <motion.div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4" variants={staggerChildren}>
              <LaunchedFeatureCard icon={<Video />} title={t('features.cards.liveSessions.title')} description={t('features.cards.liveSessions.description')} />
              <LaunchedFeatureCard icon={<BookOpen />} title={t('features.cards.coachingPrograms.title')} description={t('features.cards.coachingPrograms.description')} />
              <LaunchedFeatureCard icon={<TrendingUp />} title={t('features.cards.interactiveLearning.title')} description={t('features.cards.interactiveLearning.description')} />
              <LaunchedFeatureCard icon={<Calendar />} title={t('features.cards.scheduling.title')} description={t('features.cards.scheduling.description')} />
              <LaunchedFeatureCard icon={<CreditCard />} title={t('features.cards.payments.title')} description={t('features.cards.payments.description')} />
              <LaunchedFeatureCard icon={<MessageCircle />} title={t('features.cards.messaging.title')} description={t('features.cards.messaging.description')} />
              <LaunchedFeatureCard icon={<LayoutDashboard />} title={t('features.cards.coachDashboard.title')} description={t('features.cards.coachDashboard.description')} />
              <LaunchedFeatureCard icon={<Users />} title={t('features.cards.clientManagement.title')} description={t('features.cards.clientManagement.description')} />
            </motion.div>
          </div>
        </motion.section>
        <motion.section className="pb-20 sm:pb-28 pt-10 sm:pt-0" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerChildren}>
            <div className="container mx-auto px-4">
              <motion.h2 variants={fadeInUp} className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-12 md:mb-16">{t('testimonials.title')}</motion.h2>
              <motion.div className="mx-auto grid max-w-sm grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3" variants={staggerChildren}>
                <TestimonialCard quote={t('testimonials.cards.card1.quote')} author={t('testimonials.cards.card1.author')} role={t('testimonials.cards.card1.role')} />
                <TestimonialCard quote={t('testimonials.cards.card2.quote')} author={t('testimonials.cards.card2.author')} role={t('testimonials.cards.card2.role')} />
                <TestimonialCard quote={t('testimonials.cards.card3.quote')} author={t('testimonials.cards.card3.author')} role={t('testimonials.cards.card3.role')} />
              </motion.div>
            </div>
        </motion.section>
      </div>
      {!isAuthenticated && (
        <>
        <div className="transform rotate-180"><ShapeDivider variants={fadeInUp}/></div>
        <motion.section className="relative text-center text-primary-foreground overflow-hidden bg-gradient-animated bg-size-400  " initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }} variants={staggerChildren}>
          <div className="relative isolate container mx-auto px-4 py-32 sm:py-40 ">
            <motion.h2 variants={fadeInUp} className="text-3xl font-bold tracking-tight sm:text-4xl dark:text-foreground">{t('finalCta.title')}</motion.h2>
            <motion.div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row" variants={staggerChildren}>
              <motion.div variants={fadeInUp} className="w-full sm:w-auto"><Button asChild size="lg" variant="hero" className="w-full"><Link to="/signup">{t('finalCta.buttons.client')}</Link></Button></motion.div>
              <motion.div variants={fadeInUp} className="w-full sm:w-auto"><Button asChild size="lg" variant="hero" className="w-full border-primary-foreground/50 bg-white/10 backdrop-blur-sm hover:bg-white/20"><Link to="/coach-signup">{t('finalCta.buttons.coach')}</Link></Button></motion.div>
            </motion.div>
          </div>
        </motion.section>
        </>
      )}
    </div>
  );
};

// --- MAIN WRAPPER COMPONENT ---

const Home = () => {
  const isLaunched = process.env.REACT_APP_LAUNCHED === 'true';

  if (isLaunched) {
    return <LaunchedHome />;
  }
  
  return <PreLaunchHome />;
};

export default Home;