import React from 'react';
import PropTypes from 'prop-types';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { useAuth } from '../../contexts/AuthContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip.tsx";
import { logger } from '../../utils/logger';

const getInitials = (firstName = '', lastName = '') => {
  if (!firstName && !lastName) return 'U';
  return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
};

const ParticipantAvatarStack = ({ participants, maxVisible = 5 }) => {
  const { user } = useAuth();
  const currentUserId = user?._id;

  const otherParticipants = Array.isArray(participants)
    ? participants.filter(p => p && p._id !== currentUserId)
    : [];

  if (otherParticipants.length === 0) {
    // This provides a clearer message during development if the participants array is empty.
    return <span className="text-xs text-slate-500 dark:text-slate-400">Loading participants...</span>;
  }

  const visibleParticipants = otherParticipants.slice(0, maxVisible);
  const overflowCount = otherParticipants.length - visibleParticipants.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center -space-x-2">
        {visibleParticipants.map(participant => {
          if (!participant?._id) return null; // Add a safety check for valid participant object

          // --- THIS IS THE CORRECTED LOGIC ---
          // It now precisely mirrors the working logic from ConversationItem.js.
          // 1. It checks if the participant's role is 'coach'.
          // 2. Only if they are a coach, it tries to use the coachProfilePicture.
          // 3. In all other cases (not a coach, or a coach without a specific pic), it falls back to the general profilePicture.
          const avatarUrl =
            participant.role === 'coach' && participant.coachProfilePicture?.url
              ? participant.coachProfilePicture.url
              : participant.profilePicture?.url || '';

          const displayName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();

          // This log will now clearly show the data for each participant.
          // Check your browser console to verify that coaches have the `coachProfilePicture` object.
          logger.debug('[ParticipantAvatarStack] Rendering participant avatar', {
            participantId: participant._id,
            name: displayName,
            role: participant.role,
            coachPicObject: participant.coachProfilePicture, // Should contain { url: '...' } for coaches
            userPicObject: participant.profilePicture,
            finalAvatarUrl: avatarUrl, // The URL that was chosen
          });

          return (
            <Tooltip key={participant._id}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 border-2 border-slate-50 dark:border-slate-900">
                  <AvatarImage src={avatarUrl} alt={displayName} />
                  <AvatarFallback className="text-xs">
                    {getInitials(participant.firstName, participant.lastName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{displayName}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {overflowCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-50 dark:border-slate-900 bg-slate-200 dark:bg-slate-700">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  +{overflowCount}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{overflowCount} +</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

ParticipantAvatarStack.propTypes = {
  participants: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string.isRequired,
    firstName: PropTypes.string,
    lastName: PropTypes.string,
    role: PropTypes.string,
    profilePicture: PropTypes.shape({ url: PropTypes.string }),
    coachProfilePicture: PropTypes.shape({ url: PropTypes.string }),
  })),
  maxVisible: PropTypes.number,
};

export default ParticipantAvatarStack;