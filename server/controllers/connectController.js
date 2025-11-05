const { logger } = require('../utils/logger');
const stripeService = require('../services/stripeService');
const Coach = require('../models/Coach');
const { STRIPE_ACCOUNT_STATUS } = require('../constants/stripeConstants');
const { mergeSettings } = require('../utils/settingsHelper');


class ConnectController {
  async createAccount(req, res) {
    console.log('[Debug] Controller received request:', {
      body: req.body,
      user: req.user
    });
    try {
      const userId = req.user._id;
      logger.info('[ConnectController] Starting Connect account creation:', { 
        userId,
        userEmail: req.user.email,
        frontendUrl: process.env.FRONTEND_URL
      });

      const coach = await Coach.findOne({ user: userId });
      if (!coach) {
        logger.error('[ConnectController] Coach not found:', { userId });
        return res.status(404).json({ 
          success: false, 
          message: 'Coach profile not found' 
        });
      }

      logger.debug('[ConnectController] Found coach profile:', {
        userId,
        coachId: coach._id,
        hasStripeAccount: !!coach.settings?.paymentAndBilling?.stripe?.accountId
      });

      // Check if account already exists
      if (coach.settings?.paymentAndBilling?.stripe?.accountId) {
        logger.info('[ConnectController] Connect account already exists:', {
          userId,
          stripeAccountId: coach.settings.paymentAndBilling.stripe.accountId
        });
        
        // Return existing account link if account exists but not fully onboarded
        if (!coach.settings.paymentAndBilling.stripe.accountStatus.detailsSubmitted) {
          const accountLink = await stripeService.createAccountLink(
            coach.settings.paymentAndBilling.stripe.accountId,  // <- Use existing accountId
            req.body.refresh_url || `${process.env.FRONTEND_URL}/settings/connect/refresh`,
            req.body.return_url || `${process.env.FRONTEND_URL}/settings/connect/complete`
          );
          return res.json({ 
            success: true, 
            accountLink: accountLink.url,
            exists: true 
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'Stripe Connect account already exists',
          code: 'ACCOUNT_EXISTS'
        });
      }

      // Ensure frontend URL is properly formatted
      const frontendUrl = process.env.FRONTEND_URL.startsWith('http') 
        ? process.env.FRONTEND_URL 
        : `http://${process.env.FRONTEND_URL}`;

      const businessProfileUrl = `${frontendUrl}/coach/${userId}`; // Using userId instead of coachId

      logger.debug('[ConnectController] Preparing Connect account creation:', {
        userId,
        businessProfileUrl,
        frontendUrl
      });

      const accountOptions = {
        business_profile: {
          mcc: '8299', // Educational Services
          url: businessProfileUrl,
          name: `${req.user.firstName} ${req.user.lastName}`.trim()
        },
        metadata: {
          userId: userId.toString(),
          coachId: coach._id.toString()
        }
      };

      // Create new Express account
      const account = await stripeService.createConnectAccount(
        req.user.email,
        'CH',
        accountOptions
      );

      logger.info('[ConnectController] Connect account created:', {
        userId,
        stripeAccountId: account.id,
        businessProfileUrl,
        hasChargesEnabled: account.charges_enabled,
        hasDetailsSubmitted: account.details_submitted
      });

      const defaultSettings = {
        professionalProfile: {
          specialties: [],
          expertise: [],
          showTestimonials: true,
          showReviews: true
        },
        availabilityManagement: {
          workingHours: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' },
            saturday: { start: null, end: null },
            sunday: { start: null, end: null }
          },
          vacationMode: false,
          bufferTime: 15
        },
        sessionManagement: {
          sessionTypes: [],
          maxSessionsPerDay: 8,
          maxSessionsPerWeek: 40,
          durationRules: {
            minDuration: 30,
            maxDuration: 120,
            defaultDuration: 60,
            durationStep: 15,
            allowCustomDuration: true
          }
        },
        clientManagement: {
          clientCapacity: 20,
          waitingListEnabled: false,
          waitingListCapacity: 10
        },
        marketingAndGrowth: {
          featuredCoach: false,
          referralProgramEnabled: false,
          referralReward: 0
        },
        analyticsDashboard: {
          displayMetrics: [],
          customReports: []
        },
        privacySettings: {
          calendarVisibility: 'public',
          showFullCalendar: true,
          bookingPrivacy: 'public',
          requireApprovalNonConnected: false,
          profilePrivacy: {
            bio: true,
            specialties: true,
            ratings: true,
            pricing: true
          },
          sessionTypeVisibility: {},
          availabilityNotifications: 'all',
          notificationGroups: [],
          showEmail: false,
          showPhone: false
        },
        notificationPreferences: {
          email: true,
          sms: false,
          inApp: true
        }
      };

      // Update coach profile with account details
      const stripeSettings = {
        paymentAndBilling: {
          stripe: {
            accountId: account.id,
            accountType: 'express',
            accountStatus: {
              status: STRIPE_ACCOUNT_STATUS.PENDING,
              detailsSubmitted: false,
              chargesEnabled: false,
              payoutsEnabled: false,
              lastChecked: new Date()
            },
            payoutSettings: {
              schedule: {
                interval: 'weekly',
                weeklyAnchor: 1
              },
              defaultCurrency: 'CHF',
              minimumPayout: {
                amount: 50,
                currency: 'CHF'
              }
            },
            capabilities: {
              cardPayments: 'inactive',
              transfers: 'inactive',
              sepaDebit: 'inactive'
            },
            businessProfile: {
              mcc: '8299'
            }
          }
        }
      };

      // Merge settings preserving existing values
coach.settings = mergeSettings(
  coach.settings || defaultSettings,
  stripeSettings
);
      
      logger.debug('[ConnectController] Updated coach settings:', {
        userId: coach.user,
        stripeAccountId: account.id,
        hasPaymentAndBilling: !!coach.settings?.paymentAndBilling,
        hasStripeSettings: !!coach.settings?.paymentAndBilling?.stripe
      });

      await coach.save();
      logger.debug('[ConnectController] Updated coach profile with Stripe account:', {
        userId,
        stripeAccountId: account.id
      });

      // Create account link for onboarding
      const accountLink = await stripeService.createAccountLink(
        account.id,
        req.body.refresh_url || `${process.env.FRONTEND_URL}/settings/connect/refresh`,
        req.body.return_url || `${process.env.FRONTEND_URL}/settings/connect/complete`
      );

      logger.info('[ConnectController] Account link created:', {
        userId,
        stripeAccountId: account.id,
        hasUrl: !!accountLink.url
      });

      res.json({
        success: true,
        accountLink: accountLink.url
      });

    } catch (error) {
      logger.error('[ConnectController] Error creating Connect account:', {
        error: error.message,
        code: error.code,
        type: error.type,
        userId: req.user._id,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Error creating Stripe Connect account',
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message
      });
    }
  }

  async getAccountStatus(req, res) {
    try {
      const coachId = req.user._id;
      logger.info('[ConnectController] Getting Connect account status:', { 
        coachId,
        user: req.user,
        path: req.path
      });

      const coach = await Coach.findOne({ user: coachId });
      logger.info('[ConnectController] Found coach:', { 
        coachFound: !!coach,
        hasSettings: !!coach?.settings,
        hasStripe: !!coach?.settings?.paymentAndBilling?.stripe
      });

      if (!coach) { // Added a check if coach itself is null
        logger.warn('[ConnectController] Coach not found for user ID during getAccountStatus:', { coachId });
        return res.status(404).json({
            success: false,
            message: 'Coach profile not found.'
        });
      }


      if (!coach.settings?.paymentAndBilling?.stripe?.accountId) {
        return res.status(404).json({
          success: false,
          message: 'No Stripe Connect account found'
        });
      }

      const accountId = coach.settings.paymentAndBilling.stripe.accountId;
      const account = await stripeService.retrieveConnectAccount(accountId);

      // Defensive check and potential re-initialization of cancellationPolicy
      if (coach.settings && typeof coach.settings.cancellationPolicy === 'number') {
        logger.warn(`[ConnectController] Coach ${coach._id} has outdated numeric cancellationPolicy (${coach.settings.cancellationPolicy}). Re-initializing to default object structure before saving Stripe status. RUN MIGRATION SCRIPT!`);
        const numericValue = coach.settings.cancellationPolicy;
        coach.settings.cancellationPolicy = { // Apply default structure
            oneOnOne: {
              tiers: [
                { hoursBefore: numericValue, refundPercentage: 100, descriptionKey: `policy.oneOnOne.tier.migrated_full_refund_gt_${numericValue}h` },
                { hoursBefore: Math.max(0, numericValue / 2), refundPercentage: 50, descriptionKey: `policy.oneOnOne.tier.migrated_partial_refund_${Math.max(0, numericValue / 2)}_${numericValue}h` },
                { hoursBefore: 0, refundPercentage: 0, descriptionKey: "policy.oneOnOne.tier.no_refund_lt_x" }
              ],
              minimumNoticeHoursClientCancellation: Math.max(0, Math.floor(numericValue / 6)),
              additionalNotes: "Policy auto-migrated during Stripe status check.",
              rescheduling: {
                allowClientInitiatedRescheduleHoursBefore: numericValue,
                clientRescheduleApprovalMode: 'coach_approval_if_late',
                maxClientReschedulesPerBooking: null
              }
            },
            webinar: { // Default webinar policy
              tiers: [
                { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.webinar.tier.full_refund_gt_24h" }
              ],
              minimumNoticeHoursClientCancellation: 24,
              additionalNotes: "Default webinar policy."
            },
            lastUpdated: new Date()
          };
        coach.markModified('settings.cancellationPolicy');
      } else if (coach.settings && (!coach.settings.cancellationPolicy || !coach.settings.cancellationPolicy.oneOnOne || !coach.settings.cancellationPolicy.webinar)) {
        logger.warn(`[ConnectController] Coach ${coach._id} has incomplete cancellationPolicy object. Re-initializing to default object structure before saving Stripe status. RUN MIGRATION SCRIPT! Current:`, coach.settings.cancellationPolicy);
        const existingPolicy = coach.settings.cancellationPolicy || {};
        coach.settings.cancellationPolicy = { // Apply default structure
            oneOnOne: existingPolicy.oneOnOne || {
              tiers: [
                { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.oneOnOne.tier.full_refund_gt_24h" },
                { hoursBefore: 4, refundPercentage: 50, descriptionKey: "policy.oneOnOne.tier.partial_refund_4_24h" },
                { hoursBefore: 0, refundPercentage: 0, descriptionKey: "policy.oneOnOne.tier.no_refund_lt_4h" }
              ],
              minimumNoticeHoursClientCancellation: 4,
              additionalNotes: "Default 1-on-1 policy applied during Stripe status check.",
              rescheduling: {
                allowClientInitiatedRescheduleHoursBefore: 24,
                clientRescheduleApprovalMode: 'coach_approval_if_late',
                maxClientReschedulesPerBooking: null
              }
            },
            webinar: existingPolicy.webinar || {
              tiers: [
                { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.webinar.tier.full_refund_gt_24h" }
              ],
              minimumNoticeHoursClientCancellation: 24,
              additionalNotes: "Default webinar policy applied during Stripe status check."
            },
            lastUpdated: existingPolicy.lastUpdated || new Date()
          };
        coach.markModified('settings.cancellationPolicy');
      }


      // Update coach profile with latest status
      coach.settings.paymentAndBilling.stripe.accountStatus = {
        status: account.charges_enabled && account.payouts_enabled 
          ? STRIPE_ACCOUNT_STATUS.ACTIVE 
          : STRIPE_ACCOUNT_STATUS.PENDING,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        requirementsProvided: account.requirements?.currently_due || [],
        requirementsPending: account.requirements?.pending_verification || [],
        requirementsDue: account.requirements?.eventually_due || [],
        requirementsErrors: account.requirements?.errors?.map(error => ({
          code: error.code,
          reason: error.reason,
          resolveBy: error.deadline ? new Date(error.deadline * 1000) : null
        })) || [],
        lastChecked: new Date()
      };
      coach.markModified('settings.paymentAndBilling.stripe.accountStatus');

      await coach.save();

      logger.info('[ConnectController] Account status updated:', {
        coachId,
        stripeAccountId: accountId,
        status: coach.settings.paymentAndBilling.stripe.accountStatus.status
      });

      res.json({
        success: true,
        status: coach.settings.paymentAndBilling.stripe.accountStatus
      });

    } catch (error) {
      logger.error('[ConnectController] Error getting account status:', {
        error: error.message,
        stack: error.stack,
        userId: req.user._id
      });

      res.status(500).json({
        success: false,
        message: 'Error retrieving Connect account status',
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message
      });
    }
  }

  async getAccountDashboardLink(req, res) {
    try {
      const userId = req.user._id;
      logger.info('[ConnectController] Requesting Stripe dashboard link:', {
        userId,
        userEmail: req.user.email,
        timestamp: new Date().toISOString()
      });
      console.log('[ConnectController] Initiating dashboard link request:', {
        userId,
        role: req.user.role,
        timestamp: new Date().toISOString()
      });

      const coach = await Coach.findOne({ user: userId });
      if (!coach) {
        logger.error('[ConnectController] Coach not found for dashboard link:', {
          userId,
          timestamp: new Date().toISOString()
        });
        console.error('[ConnectController] No coach profile found:', {
          userId,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({
          success: false,
          message: 'Coach profile not found'
        });
      }

      logger.debug('[ConnectController] Checking Stripe account existence:', {
        coachId: coach._id,
        hasStripe: !!coach.settings?.paymentAndBilling?.stripe?.accountId,
        timestamp: new Date().toISOString()
      });
      console.log('[ConnectController] Coach profile check:', {
        coachId: coach._id,
        stripeExists: !!coach.settings?.paymentAndBilling?.stripe?.accountId,
        timestamp: new Date().toISOString()
      });

      const stripeAccountId = coach.settings?.paymentAndBilling?.stripe?.accountId;
      if (!stripeAccountId) {
        logger.warn('[ConnectController] No Stripe account found for coach:', {
          coachId: coach._id,
          userId,
          timestamp: new Date().toISOString()
        });
        console.warn('[ConnectController] Missing Stripe account ID:', {
          coachId: coach._id,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({
          success: false,
          message: 'No Stripe Connect account found. Please create one first.'
        });
      }

      // Ensure frontend URL is properly formatted
      const frontendUrl = process.env.FRONTEND_URL.startsWith('http')
        ? process.env.FRONTEND_URL
        : `http://${process.env.FRONTEND_URL}`;
      
      logger.debug('[ConnectController] Generating Stripe login link:', {
        stripeAccountId,
        redirectUrl: `${frontendUrl}/coach/settings`,
        timestamp: new Date().toISOString()
      });
      console.log('[ConnectController] Preparing Stripe dashboard link:', {
        stripeAccountId,
        redirectUrl: `${frontendUrl}/coach/settings`,
        timestamp: new Date().toISOString()
      });

      const loginLink = await stripeService.createLoginLink(stripeAccountId, {
        redirect_url: `${frontendUrl}/coach/settings`
      });

      logger.info('[ConnectController] Successfully generated dashboard link:', {
        userId,
        stripeAccountId,
        linkUrl: loginLink.url,
        timestamp: new Date().toISOString()
      });
      console.log('[ConnectController] Dashboard link created:', {
        stripeAccountId,
        url: loginLink.url,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        redirectUrl: loginLink.url
      });
    } catch (error) {
      logger.error('[ConnectController] Error generating dashboard link:', {
        error: error.message,
        stack: error.stack,
        userId: req.user._id,
        timestamp: new Date().toISOString()
      });
      console.error('[ConnectController] Failed to generate dashboard link:', {
        userId: req.user._id,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        message: 'Error generating dashboard link',
        error: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message
      });
    }
  }

  // Add more methods...
}

module.exports = new ConnectController();