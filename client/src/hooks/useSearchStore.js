import { create } from 'zustand';
import { logger } from '../utils/logger';

export const useSearchStore = create((set) => ({
  isOpen: false,
  onOpen: () => {
    logger.info('[useSearchStore] onOpen called. Setting isOpen to true.');
    set({ isOpen: true });
  },
  onClose: () => {
    logger.info('[useSearchStore] onClose called. Setting isOpen to false.');
    set({ isOpen: false });
  },
  toggle: () => set((state) => {
    logger.info(`[useSearchStore] toggle called. Current isOpen: ${state.isOpen}. New isOpen: ${!state.isOpen}`);
    return { isOpen: !state.isOpen };
  }),
}));