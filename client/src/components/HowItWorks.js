import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { logger } from '../utils/logger';
import {
  Users, Briefcase, PlayCircle, Calendar, GraduationCap, Clock,
  TrendingUp, ArrowRight
} from 'lucide-react';
import logoWhite from '../assets/logo_mark_transparent_white.svg';

import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.jsx';
import { cn } from '../lib/utils';

// Animation variants for consistency
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
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
        }
    }
};

const JourneyStep = ({ number, title, children }) => (
    <motion.div variants={fadeInUp} className="flex flex-col md:flex-row items-start gap-8 md:gap-12">
        <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-primary text-3xl md:text-4xl font-bold text-primary-foreground flex-shrink-0">
                {number}
            </div>
            <h3 className="md:hidden text-2xl font-bold tracking-tight text-foreground">{title}</h3>
        </div>
        <div className="w-full">
            <h3 className="hidden md:block text-3xl font-bold tracking-tight text-foreground mb-6">{title}</h3>
            {children}
        </div>
    </motion.div>
);

JourneyStep.propTypes = {
    number: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
};

const BenefitCard = ({ icon, title, content, isUsp }) => {
    const Icon = icon;
    return (
        <motion.div variants={fadeInUp} className="w-full">
            <Card className={cn( "group h-full flex flex-col transition-all duration-300 hover:shadow-2xl dark:bg-card/50", isUsp && "border-2 border-primary shadow-lg ring-4 ring-primary/10" )}>
                <CardHeader className="flex-row items-center gap-4 pb-4">
                    <div className={cn( "flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover:bg-primary/20", isUsp && "bg-primary/20" )}>
                        <Icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-muted-foreground">{content}</p>
                </CardContent>
            </Card>
        </motion.div>
    );
};

BenefitCard.propTypes = {
    icon: PropTypes.elementType.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    isUsp: PropTypes.bool,
};

const HowItWorks = () => {
  const [userType, setUserType] = useState('client');
  const { t } = useTranslation(['home', 'pageTitles']);
  const isLaunched = process.env.REACT_APP_LAUNCHED === 'true';

  useEffect(() => {
  document.title = t('pageTitles:howItWorks', 'How It Works - Bondigoo');
  }, [t]);

  logger.info('[HowItWorks] Rendering page with active userType:', userType);

return (
    <div className="bg-gradient-subtle text-foreground overflow-x-hidden">
     {!isLaunched && (
          <Link to="/" className="absolute top-3 left-4 md:left-6 z-50">
            <img src={logoWhite} alt="Bondigoo Logo" className="h-10 w-auto" />
          </Link>
        )}
      <motion.section 
        className="relative text-center text-primary-foreground dark:text-foreground overflow-hidden bg-gradient-animated bg-size-400"
        variants={gradientAnimation}
        initial="initial"
        whileInView="animate" // Animate only when in view
        viewport={{ once: true }}
      >
       
        <div className="relative isolate container mx-auto px-4 py-24 sm:py-32 lg:py-40">
            <motion.div 
                initial="hidden"
                animate="visible"
                variants={staggerChildren}
                className="max-w-4xl mx-auto"
            >
                <motion.h1 variants={fadeInUp} className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                    {t('howItWorks.hero.title', 'Your Journey to Transformation, Simplified.')}
                </motion.h1>
                <motion.p variants={fadeInUp} className="mt-6 text-lg sm:text-xl text-primary-foreground/90 dark:text-foreground/90 max-w-prose mx-auto">
                    {t('howItWorks.hero.subtitle', 'Whether you\'re seeking guidance or sharing your expertise, here\'s your clear path to success. Select your role to begin.')}
                </motion.p>
                <motion.div variants={fadeInUp} className="mt-10">
                    <motion.div variants={fadeInUp} className="mt-10 w-full max-w-md mx-auto">
                    <ToggleGroup
                        type="single"
                        value={userType}
                        onValueChange={(value) => { if (value) setUserType(value); }}
                        className="hidden lg:inline-flex bg-background/20 backdrop-blur-sm p-1.5 rounded-xl border border-primary-foreground/20 dark:border-foreground/20"
                    >
                        <ToggleGroupItem value="client" aria-label="For Clients" className="px-6 py-2 text-base transition-colors text-primary-foreground/80 data-[state=on]:text-primary-foreground data-[state=on]:bg-white/20 data-[state=on]:shadow-md dark:text-foreground/70 dark:data-[state=on]:text-foreground hover:bg-white/45">
                            <Users className="mr-2 h-5 w-5" /> {t('howItWorks.toggle.client', 'I\'m Looking for a Coach')}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="coach" aria-label="For Coaches" className="px-6 py-2 text-base transition-colors text-primary-foreground/80 data-[state=on]:text-primary-foreground data-[state=on]:bg-white/20 data-[state=on]:shadow-md dark:text-foreground/70 dark:data-[state=on]:text-foreground hover:bg-white/45">
                            <Briefcase className="mr-2 h-5 w-5" /> {t('howItWorks.toggle.coach', 'I Am a Coach')}
                        </ToggleGroupItem>
                    </ToggleGroup>
                    
                    <div className="flex flex-col gap-3 lg:hidden">
                        <button
                            onClick={() => setUserType('client')}
                            aria-label="For Clients"
                            className={cn(
                                'flex w-full items-center justify-center gap-3 rounded-xl p-4 text-left text-base font-semibold transition-all duration-300 backdrop-blur-sm',
                                userType === 'client'
                                    ? 'bg-white/20 text-primary-foreground shadow-lg ring-1 ring-white/30 dark:text-foreground'
                                    : 'border border-white/20 text-primary-foreground/80 hover:bg-white/10 dark:text-foreground/70 dark:border-white/10'
                            )}
                        >
                            <Users className="h-5 w-5 flex-shrink-0" />
                            <span className="flex-grow text-center">{t('howItWorks.toggle.client', 'I\'m Looking for a Coach')}</span>
                        </button>
                         <button
                            onClick={() => setUserType('coach')}
                            aria-label="For Coaches"
                            className={cn(
                                'flex w-full items-center justify-center gap-3 rounded-xl p-4 text-left text-base font-semibold transition-all duration-300 backdrop-blur-sm',
                                userType === 'coach'
                                     ? 'bg-white/20 text-primary-foreground shadow-lg ring-1 ring-white/30 dark:text-foreground'
                                     : 'border border-white/20 text-primary-foreground/80 hover:bg-white/10 dark:text-foreground/70 dark:border-white/10'
                            )}
                        >
                            <Briefcase className="h-5 w-5 flex-shrink-0" />
                            <span className="flex-grow text-center">{t('howItWorks.toggle.coach', 'I Am a Coach')}</span>
                        </button>
                    </div>
                </motion.div>
                </motion.div>
            </motion.div>
        </div>
      </motion.section>

      <main className="container mx-auto px-4 py-16 sm:py-24">
        {userType === 'client' && (
            <motion.div
                key="client-journey"
                initial="hidden"
                animate="visible"
                variants={staggerChildren}
                className="space-y-20 md:space-y-24"
            >
                <JourneyStep number="1" title={t('howItWorks.client.step1.title', 'Find the Right Person for Your Path.')}>
                    <p className="text-lg text-muted-foreground max-w-prose">
                        {t('howItWorks.client.step1.description', 'Don\'t just find any coach—find your coach. Use our powerful filters to search by specialty and goals. Review detailed profiles, watch video introductions, and read verified reviews to find the perfect partner to guide you.')}
                    </p>
                </JourneyStep>

                <JourneyStep number="2" title={t('howItWorks.client.step2.title', 'Connect Your Way. On-Demand or On Schedule.')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <BenefitCard
                            icon={PlayCircle}
                            title={t('howItWorks.client.step2.card1.title', 'Immediate Support')}
                            content={t('howItWorks.client.step2.card1.description', 'Feeling stuck? Connect with an available coach for a live, per-minute session right now. Get the guidance you need, the moment you need it.')}
                     
                        />
                        <BenefitCard
                            icon={Calendar}
                            title={t('howItWorks.client.step2.card2.title', 'Plan Your Growth')}
                            content={t('howItWorks.client.step2.card2.description', 'Book one-on-one or group sessions with ease. View your coach\'s real-time availability and find a time that fits perfectly into your life.')}
                        />
                        <BenefitCard
                            icon={GraduationCap}
                            title={t('howItWorks.client.step2.card3.title', 'Learn at Your Pace')}
                            content={t('howItWorks.client.step2.card3.description', 'Enroll in structured programs created by your favorite coaches. Access videos, documents, and assignments anytime, anywhere.')}
                        />
                    </div>
                </JourneyStep>

                <JourneyStep number="3" title={t('howItWorks.client.step3.title', 'Your Personal Dashboard for Progress.')}>
                    <p className="text-lg text-muted-foreground max-w-prose">
                        {t('howItWorks.client.step3.description', 'Your journey is centralized on your personal dashboard. Easily manage upcoming sessions, track your program progress, securely message your coaches, and access shared resources—all in one place.')}
                    </p>
                </JourneyStep>
            </motion.div>
        )}

        {userType === 'coach' && (
            <motion.div
                key="coach-journey"
                initial="hidden"
                animate="visible"
                variants={staggerChildren}
                className="space-y-20 md:space-y-24"
            >
                <JourneyStep number="1" title={t('howItWorks.coach.step1.title', 'Launch Your Practice in Minutes.')}>
                     <p className="text-lg text-muted-foreground max-w-prose">
                        {t('howItWorks.coach.step1.description', 'Go from sign-up to go-live in record time. Our intuitive setup guides you through creating a compelling profile, setting your schedule with our drag-and-drop calendar, and defining your session and program pricing.')}
                    </p>
                </JourneyStep>

                <JourneyStep number="2" title={t('howItWorks.coach.step2.title', 'Monetize Your Expertise, Your Way.')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <BenefitCard
                            icon={Clock}
                            title={t('howItWorks.coach.step2.card1.title', 'Get Paid for Your Time')}
                            content={t('howItWorks.coach.step2.card1.description', 'Toggle your status to \'Online\' and earn instantly with per-minute live sessions. Capitalize on your free time and provide immediate value to clients.')}
                        />
                        <BenefitCard
                            icon={TrendingUp}
                            title={t('howItWorks.coach.step2.card2.title', 'Scale Your Impact')}
                            content={t('howItWorks.coach.step2.card2.description', 'Stop trading time for money. Build and sell scalable digital programs using our powerful creator studio. Earn passive income while you share your knowledge.')}
                        
                        />
                         <BenefitCard
                            icon={Calendar}
                            title={t('howItWorks.coach.step2.card3.title', 'Offer Planned Sessions')}
                            content={t('howItWorks.coach.step2.card3.description', 'Monetize your calendar by offering pre-booked 1-on-1 sessions and group webinars. Our platform handles the scheduling, reminders, and payments so you can focus on what you do best: coaching.')}
                        />
                    </div>
                </JourneyStep>

                <JourneyStep number="3" title={t('howItWorks.coach.step3.title', 'We Handle the Admin, You Handle the Coaching.')}>
                    <p className="text-lg text-muted-foreground max-w-prose">
                        {t('howItWorks.coach.step3.description', 'This is your command center. Track your earnings with detailed analytics, manage your client relationships, and never worry about invoicing again. We manage secure payments, global tax compliance, and provide you with all the B2B documentation you need for seamless accounting.')}
                    </p>
                </JourneyStep>
            </motion.div>
        )}

        <motion.section 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={staggerChildren}
            className="pt-24"
        >
          <motion.h2 variants={fadeInUp} className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-12">
            {t('howItWorks.faq.title', 'Your Questions, Answered')}
          </motion.h2>
        <motion.div variants={fadeInUp} className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
                {userType === 'client' && (
                    <>
                        <AccordionItem value="item-client-1">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.client.q1', 'How does pricing work?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.client.a1', "It's simple and transparent. You only pay the rate set by the coach, plus any applicable VAT. There are no hidden platform fees or subscriptions for clients. The price you see is the price you pay.")}
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-client-2">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.client.q2', 'How can I ensure a great match with a coach?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.client.a2', "We empower you to find the perfect fit! We recommend watching a coach's intro video, reading their profile and reviews from other users, and even sending them a message before booking a session. This helps ensure your goals and their approach are perfectly aligned for a successful journey.")}
                            </AccordionContent>
                        </AccordionItem>
                         <AccordionItem value="item-client-3">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.client.q3', 'Is my data private and secure?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.client.a3', 'Absolutely. We use end-to-end encryption for all video sessions and messages. Your personal data is stored securely and is never shared with third parties without your explicit consent. You can review our full privacy policy for more details.')}
                            </AccordionContent>
                        </AccordionItem>
                    </>
                )}
                {userType === 'coach' && (
                    <>
                        <AccordionItem value="item-coach-1">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.coach.q1', 'What are the platform fees?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.coach.a1', 'We believe in transparency. We apply a percentage-based platform fee to the net value of each transaction. This fee covers payment processing, platform maintenance, and marketing, allowing us to continuously improve the platform for you and connect you with more clients.')}
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-coach-2">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.coach.q2', 'How and when do I get paid?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.coach.a2', "Our system uses an automated, delayed payout schedule to ensure financial accuracy. After a client's payment is completed, funds are held for a 24-hour security period. After this hold, the funds become part of your next scheduled payout, which is processed automatically to your connected Stripe account. This eliminates the need for manual requests and ensures a reliable and predictable payment cycle.")}
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-coach-3">
                            <AccordionTrigger className="text-lg text-left">{t('howItWorks.faq.coach.q3', 'What qualifications do I need to coach?')}</AccordionTrigger>
                            <AccordionContent className="text-base text-muted-foreground">
                               {t('howItWorks.faq.coach.a3', 'We firmly believe that everyone has valuable knowledge, skills, or life experience to share. While formal certifications can be a great advantage in certain fields, they are not a requirement. What matters most is your ability to guide and support others. Our platform is designed to connect people who want to learn with those who are ready to share.')}
                            </AccordionContent>
                        </AccordionItem>
                    </>
                )}
            </Accordion>
          </motion.div>
        </motion.section>
      </main>

      {isLaunched && (
        <section className="bg-secondary">
            <div className="container mx-auto px-4 py-16 sm:py-24 text-center">
                 <motion.div
                    key={userType}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.5 }}
                    variants={staggerChildren}
                >
                    <motion.h2 variants={fadeInUp} className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                        {userType === 'client'
                            ? t('howItWorks.cta.client.title', 'Ready to Find Your Coach?')
                            : t('howItWorks.cta.coach.title', 'Ready to Share Your Knowledge?')
                        }
                    </motion.h2>
                    <motion.div variants={fadeInUp} className="mt-8">
                        <Button asChild size="lg" className="w-full sm:w-auto group">
                            <Link to={userType === 'client' ? '/coaches' : '/coach-signup'}>
                                {userType === 'client'
                                    ? t('howItWorks.cta.client.button', 'Explore Coaches')
                                    : t('howItWorks.cta.coach.button', 'Start as a Coach')
                                }
                                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </Button>
                    </motion.div>
                </motion.div>
            </div>
        </section>
      )}
    </div>
  );
};

export default HowItWorks;