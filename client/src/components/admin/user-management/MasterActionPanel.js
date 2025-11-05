
import React, { useState } from 'react';
import { Button } from '../../ui/button.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../ui/alert-dialog.tsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { useTranslation } from 'react-i18next';
import { useUpdateUserByAdmin, useImpersonateUser, useRequestPasswordResetByAdmin, useVerifyUserEmailByAdmin, useDeleteUserByAdmin } from '../../../hooks/useAdmin';
import { toast } from 'react-hot-toast';
import { useQueryClient } from 'react-query';

const MasterActionPanel = ({ user, onUserUpdate }) => {
  const { t } = useTranslation(['admin']);
  const queryClient = useQueryClient();
  const updateUserMutation = useUpdateUserByAdmin();
  const impersonateUserMutation = useImpersonateUser();
  const requestPasswordResetMutation = useRequestPasswordResetByAdmin();
  const verifyEmailMutation = useVerifyUserEmailByAdmin();
  const deleteUserMutation = useDeleteUserByAdmin();

  const [suspensionReason, setSuspensionReason] = useState('');
  const [impersonateReason, setImpersonateReason] = useState('');
  const [passwordResetReason, setPasswordResetReason] = useState('');
  const [verifyEmailReason, setVerifyEmailReason] = useState('');
  const [newRole, setNewRole] = useState(user.role);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const handleDeleteUser = async () => {
    try {
      await deleteUserMutation.mutateAsync({ 
        userId: user._id, 
        confirmationName: deleteConfirmation 
      });
      handleMutationSuccess(t('userManagement.actions.deleteSuccess'));
      // The sheet will close automatically due to user selection being cleared
    } catch (error) {
      toast.error(t('userManagement.actions.error') + (error.response?.data?.message || error.message));
    }
  };

 const handleImpersonate = async () => {
    if (!impersonateReason.trim()) {
      toast.error(t('userManagement.impersonateReasonRequired', 'A reason is required to impersonate a user.'));
      return;
    }
    try {
      const result = await impersonateUserMutation.mutateAsync({ 
        userId: user._id, 
        reason: impersonateReason 
      });
      
      localStorage.setItem('token', result.data.token);
      toast.success(result.data.message, { duration: 5000 });

      window.location.href = '/dashboard';

    } catch (error) {
      toast.error(t('userManagement.actions.impersonateError', 'Could not start impersonation:') + (error.response?.data?.message || error.message));
    }
  };

  const handlePasswordReset = async () => {
    try {
      await requestPasswordResetMutation.mutateAsync({ userId: user._id, reason: passwordResetReason });
      toast.success(t('userManagement.actions.passwordResetSuccess', 'Password reset email initiated for the user.'));
      setPasswordResetReason('');
    } catch (error) {
      toast.error(t('userManagement.actions.passwordResetError', 'Failed to initiate password reset:') + (error.response?.data?.message || error.message));
    }
  };

const handleVerifyEmail = async () => {
    try {
      await verifyEmailMutation.mutateAsync({ userId: user._id, reason: verifyEmailReason });
      handleMutationSuccess(t('userManagement.actions.verifyEmailSuccess', 'User email has been manually verified.'));
      setVerifyEmailReason('');
    } catch (error) {
      toast.error(t('userManagement.actions.verifyEmailError', 'Failed to verify email:') + (error.response?.data?.message || error.message));
    }
  };

  const handleMutationSuccess = (successMessage) => {
    toast.success(successMessage);
    onUserUpdate(); 
    queryClient.invalidateQueries('adminUsers');
  };
  
  const handleSuspendReactivate = async (isActive) => {
    try {
      await updateUserMutation.mutateAsync({
        userId: user._id,
        updateData: { isActive, suspensionReason: isActive ? null : suspensionReason }
      });
      handleMutationSuccess(isActive ? t('userManagement.actions.reactivateSuccess') : t('userManagement.actions.suspendSuccess'));
      setSuspensionReason('');
    } catch (error) {
      toast.error(t('userManagement.actions.error') + (error.response?.data?.message || error.message));
    }
  };

  const handleChangeRole = async () => {
    try {
      await updateUserMutation.mutateAsync({
        userId: user._id,
        updateData: { role: newRole }
      });
      handleMutationSuccess(t('userManagement.actions.changeRoleSuccess', { role: newRole }));
    } catch (error)      {
      toast.error(t('userManagement.actions.error') + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-4 bg-muted/50 dark:bg-zinc-800/50 rounded-lg">
      <h3 className="text-md font-semibold w-full mb-2">{t('userManagement.godMode.title', 'Master Mode Actions')}</h3>
      
      {/* Suspend/Reactivate Account */}
      {user.isActive ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">{t('userManagement.actions.suspend', 'Suspend Account')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('userManagement.suspendConfirmTitle', 'Confirm Suspension')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('userManagement.suspendConfirmDesc', 'This will prevent the user from logging in. Please provide a reason.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-4 py-4">
              <Label htmlFor="suspensionReason">{t('userManagement.suspendReason', 'Reason')}</Label>
              <Textarea
                id="suspensionReason"
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder={t('userManagement.suspendReasonPlaceholder', 'E.g., Violation of terms, abusive behavior')}
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleSuspendReactivate(false)}
                disabled={!suspensionReason.trim()}
                className="bg-destructive hover:bg-destructive/90 text-white"
              >
                {t('userManagement.actions.suspendConfirm', 'Suspend')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 dark:text-green-400 dark:border-green-400 dark:hover:bg-green-900/20">
              {t('userManagement.actions.reactivate', 'Reactivate Account')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('userManagement.reactivateConfirmTitle', 'Confirm Reactivation')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('userManagement.reactivateConfirmDesc', 'Are you sure you want to reactivate this account?')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleSuspendReactivate(true)}>{t('userManagement.actions.reactivateConfirm', 'Reactivate')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Change Role */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">{t('userManagement.actions.changeRole', 'Change Role')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('userManagement.changeRoleTitle', 'Change User Role')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('userManagement.changeRoleDesc', 'Select a new role for this user.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="newRole">{t('userManagement.newRole', 'New Role')}</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger id="newRole">
                <SelectValue placeholder={t('userManagement.selectRole', 'Select Role')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangeRole} disabled={user.role === newRole}>
              {t('userManagement.actions.changeRoleConfirm', 'Change Role')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary">{t('userManagement.actions.resetPassword', 'Reset Password')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('userManagement.resetPasswordConfirmTitle', 'Confirm Password Reset')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('userManagement.resetPasswordConfirmDesc', 'This will send a password reset link to the user\'s email. Provide a reason for this action.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-4 py-4">
              <Label htmlFor="passwordResetReason">{t('userManagement.passwordResetReason', 'Reason')}</Label>
              <Textarea
                id="passwordResetReason"
                value={passwordResetReason}
                onChange={(e) => setPasswordResetReason(e.target.value)}
                placeholder={t('userManagement.passwordResetReasonPlaceholder', 'E.g., User requested reset via support chat.')}
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handlePasswordReset} disabled={!passwordResetReason.trim() || requestPasswordResetMutation.isLoading}>
                {t('userManagement.actions.resetPasswordConfirm', 'Initiate Reset')}
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Verify Email */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" disabled={user.isEmailVerified}>{t('userManagement.actions.verifyEmail', 'Verify Email')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('userManagement.verifyEmailConfirmTitle', 'Confirm Email Verification')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('userManagement.verifyEmailConfirmDesc', 'This will manually mark the user\'s email as verified. Provide a reason for this action.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-4 py-4">
              <Label htmlFor="verifyEmailReason">{t('userManagement.verifyEmailReason', 'Reason')}</Label>
              <Textarea
                id="verifyEmailReason"
                value={verifyEmailReason}
                onChange={(e) => setVerifyEmailReason(e.target.value)}
                placeholder={t('userManagement.verifyEmailReasonPlaceholder', 'E.g., User confirmed email ownership through alternate channel.')}
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleVerifyEmail} disabled={!verifyEmailReason.trim() || verifyEmailMutation.isLoading}>
                {t('userManagement.actions.verifyEmailConfirm', 'Verify Email')}
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Impersonate User */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" className="bg-orange-500 hover:bg-orange-600 text-white dark:bg-orange-600 dark:hover:bg-orange-700">
            {t('userManagement.actions.impersonate', 'Impersonate User')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('userManagement.impersonateConfirmTitle', 'Confirm Impersonation')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('userManagement.impersonateConfirmDesc', 'Impersonating a user allows you to view the platform as them. All actions will be logged. Provide a reason.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="impersonateReason">{t('userManagement.impersonateReason', 'Reason for Impersonation')}</Label>
            <Textarea
              id="impersonateReason"
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
              placeholder={t('userManagement.impersonateReasonPlaceholder', 'E.g., Debugging a user-reported bug, assisting with setup')}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleImpersonate}
              disabled={!impersonateReason.trim() || impersonateUserMutation.isLoading}
            >
              {t('userManagement.actions.impersonateConfirm', 'Impersonate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="bg-red-700 hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-900">
            {t('userManagement.actions.delete', 'Delete User')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('userManagement.deleteConfirmTitle', 'Permanently Delete User?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('userManagement.deleteConfirmDesc', 'This action is irreversible. All user data, including sessions and financial records, will be queued for permanent deletion. To proceed, type the user\'s full name:')} <strong className="text-foreground">{user.firstName} {user.lastName}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="deleteConfirmation">{t('userManagement.deleteConfirmationLabel', 'Confirm Name')}</Label>
            <Input
              id="deleteConfirmation"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={`${user.firstName} ${user.lastName}`}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteConfirmation !== `${user.firstName} ${user.lastName}` || deleteUserMutation.isLoading}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {t('userManagement.actions.deleteConfirm', 'Permanently Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
    </div>
  );
};

export default MasterActionPanel;