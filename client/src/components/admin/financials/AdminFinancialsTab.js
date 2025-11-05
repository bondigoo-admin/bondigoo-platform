import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import TransactionsLedger from './TransactionsLedger';
import PayoutManagement from './PayoutManagement';
import DisputeManagement from './DisputeManagement';
import DiscountManagement from './DiscountManagement';
import VatReportingTab from './VatReportingTab';

const AdminFinancialsTab = () => {
  const { t } = useTranslation(['admin']);

  return (
   <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('financials.title', 'Financial Command Center')}</h2>
      </div>
      <Tabs defaultValue="transactions" className="flex flex-col flex-1 min-h-0">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="transactions">{t('financials.transactionsLedger', 'Transactions Ledger')}</TabsTrigger>
          <TabsTrigger value="payouts">{t('financials.payoutManagement', 'Payouts')}</TabsTrigger>
          <TabsTrigger value="disputes">{t('financials.disputeManagement', 'Disputes')}</TabsTrigger>
          <TabsTrigger value="discounts">{t('financials.discountManagement', 'Discounts')}</TabsTrigger>
          <TabsTrigger value="tax">{t('financials.taxVatReporting', 'Tax & VAT Reporting')}</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="flex-1 min-h-0 mt-4">
          <TransactionsLedger />
        </TabsContent>
        <TabsContent value="payouts" className="flex-1 min-h-0 mt-4">
            <PayoutManagement />
        </TabsContent>
        <TabsContent value="disputes" className="flex-1 min-h-0 mt-4">
            <DisputeManagement />
        </TabsContent>
        <TabsContent value="discounts" className="flex-1 min-h-0 mt-4">
            <DiscountManagement />
        </TabsContent>
        <TabsContent value="tax" className="flex-1 min-h-0 mt-4">
            <VatReportingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFinancialsTab;