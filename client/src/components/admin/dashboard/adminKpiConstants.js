export const adminKpiDefinitions = [
    { key: 'grossMerchandiseVolume', titleKey: 'admin:kpis.gmv', descriptionKey: 'admin:kpis.gmv.desc' },
    { key: 'successfulTransactions', titleKey: 'admin:kpis.successfulTransactions', descriptionKey: 'admin:kpis.successfulTransactions.desc' },
    { key: 'averageTransactionValue', titleKey: 'admin:kpis.atv', descriptionKey: 'admin:kpis.atv.desc' },
    { key: 'netPlatformRevenue', titleKey: 'admin:kpis.netPlatformRevenue', descriptionKey: 'admin:kpis.netPlatformRevenue.desc' },
    { key: 'grossPlatformRevenue', titleKey: 'admin:kpis.grossPlatformRevenue', descriptionKey: 'admin:kpis.grossPlatformRevenue.desc' },
    { key: 'paymentProcessingFees', titleKey: 'admin:kpis.paymentProcessingFees', descriptionKey: 'admin:kpis.paymentProcessingFees.desc' },
    { key: 'platformVatLiability', titleKey: 'admin:kpis.platformVatLiability', descriptionKey: 'admin:kpis.platformVatLiability.desc' },
    { key: 'accruedCoachEarnings', titleKey: 'admin:kpis.accruedCoachEarnings', descriptionKey: 'admin:kpis.accruedCoachEarnings.desc' },
    { key: 'totalCustomerRefunds', titleKey: 'admin:kpis.totalCustomerRefunds', descriptionKey: 'admin:kpis.totalCustomerRefunds.desc' },
    { key: 'newUserSignups', titleKey: 'admin:kpis.newUserSignups', descriptionKey: 'admin:kpis.newUserSignups.desc' },
    { key: 'pendingCoachApplications', titleKey: 'admin:kpis.pendingApps', descriptionKey: 'admin:kpis.pendingApps.desc' },
    { key: 'totalSessionsBooked', titleKey: 'admin:kpis.totalSessionsBooked', descriptionKey: 'admin:kpis.totalSessionsBooked.desc' },
    { key: 'completedSessions', titleKey: 'admin:kpis.completedSessions', descriptionKey: 'admin:kpis.completedSessions.desc' },
    { key: 'totalEnrollments', titleKey: 'admin:kpis.totalEnrollments', descriptionKey: 'admin:kpis.totalEnrollments.desc' },
    { key: 'openPaymentDisputes', titleKey: 'admin:kpis.disputes', descriptionKey: 'admin:kpis.disputes.desc' },
    { key: 'flaggedReviews', titleKey: 'admin:kpis.flaggedReviews', descriptionKey: 'admin:kpis.flaggedReviews.desc' },
    { key: 'openSupportTickets', titleKey: 'admin:kpis.openSupportTickets', descriptionKey: 'admin:kpis.openSupportTickets.desc' },
];

export const defaultAdminLayoutConfig = [
    { key: 'adminKpiGrid', enabled: true },
    { key: 'financialTrendChart', enabled: true },
    { key: 'actionCenterQueue', enabled: true },
    { key: 'systemHealthPanel', enabled: true },
    { key: 'recentActivityFeed', enabled: false },
];