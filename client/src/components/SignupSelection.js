import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { User, Briefcase, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.2,
    }
  }
};

const SignupSelection = () => {
  const { t } = useTranslation('signup');

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

  return (
    <div className="min-h-full bg-gradient-subtle flex flex-col items-center justify-center p-4 sm:p-6">
      <motion.div 
        className="w-full max-w-5xl mx-auto"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeInUp} className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">{t('selection.title', 'Join Our Community')}</h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">{t('selection.subtitle', 'Choose your path and start your journey with us today.')}</p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 gap-8 md:grid-cols-2"
          variants={staggerContainer}
        >
          <SelectionCard 
            icon={<User />}
            title={t('selection.client.title', 'I want to find a Coach')}
            description={t('selection.client.description', 'For individuals seeking to unlock their potential.')}
            benefits={[
              t('selection.client.benefit1', 'Connect instantly with Live Sessions'),
              t('selection.client.benefit2', 'Track progress on your personal dashboard'),
              t('selection.client.benefit3', 'Learn on-demand with structured Programs'),
            ]}
            linkTo="/client-signup"
            ctaText={t('selection.client.cta', 'Start as a Client')}
          />
          <SelectionCard 
            icon={<Briefcase />}
            title={t('selection.coach.title', 'I want to be a Coach')}
            description={t('selection.coach.description', 'For professionals looking to grow their coaching business.')}
            benefits={[
              t('selection.coach.benefit1', 'Reach a global audience of clients'),
              t('selection.coach.benefit2', 'Sell scalable digital Programs'),
              t('selection.coach.benefit3', 'Offer instant on-demand Live Sessions'),
            ]}
            linkTo="/coach-signup"
            ctaText={t('selection.coach.cta', 'Start as a Coach')}
          />
        </motion.div>

        <motion.div variants={fadeInUp} className="text-center mt-12">
          <p className="text-muted-foreground">
            {t('selection.loginPrompt.text', 'Already have an account?')}
            <Button variant="link" asChild className="font-semibold text-primary">
              <Link to="/login">{t('selection.loginPrompt.link', 'Log In')}</Link>
            </Button>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default SignupSelection;