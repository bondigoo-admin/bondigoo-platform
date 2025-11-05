export type ConnectAccountStatus =
  | 'not_started'
  | 'pending'
  | 'incomplete'
  | 'complete'
  | 'error';

export type ConnectRequirement = {
  type: string;
  status: 'pending' | 'completed' | 'error';
  error?: string;
};

export interface ConnectAccountDetails {
  status: ConnectAccountStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: {
    pending: string[];
    completed: string[];
    errors: Array<{
      code: string;
      reason: string;
      resolveBy?: Date;
    }>;
  };
}