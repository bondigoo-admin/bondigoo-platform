import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, NavLink, useLocation } from 'react-router-dom';
import logo from '../assets/logo.svg';
import logotrans from '../assets/logo_mark_transparent.svg';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { AuthContext } from '../contexts/AuthContext';
import { useNotificationSocket } from '../contexts/SocketContext';
import {
  Bell, User, MessageCircle, Calendar, Settings,
  LayoutDashboard, Users, LogOut, Sun, Moon,
  Menu, GraduationCap, Briefcase, TrendingUp,
  BookOpen, GitFork, LogIn, University, Circle, Check, CreditCard, Search, Link2, CalendarCheck2, Library,
  Clock, UserPlus, HelpCircle,  Sparkles, Globe
} from 'lucide-react';
import { logoutUser, updateUserDetails } from '../services/userAPI';
import { updateUserStatus } from '../services/statusAPI';
import { emitEvent } from '../services/socketService';
import { logger } from '../utils/logger';
import { useNotifications } from '../hooks/useNotifications';
import { useConversations } from '../hooks/useConversations';
import { cn } from '../lib/utils';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import { useQuery } from 'react-query';
import axios from 'axios';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './ui/command.jsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { useRecentSearches } from '../hooks/useRecentSearches';
import Highlight from './ui/Highlight';
import MenuAnnouncementBadge from './MenuAnnouncementBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog.tsx';
import LeadCaptureForm from './shared/LeadCaptureForm';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const getProfilePath = (item) => {
    if (item.role) {
        return item.role === 'coach' ? `/coach/${item._id}` : `/profile/${item._id}`;
    }
    return item.path;
};

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

const HeaderSearch = () => {
    const { t } = useTranslation('search');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [value, setValue] = useState('');
    const [debouncedValue] = useDebounce(value, 300);
    const navigate = useNavigate();
    const searchContainerRef = useRef(null);
    const inputRef = useRef(null);
    const { recentSearches, addRecentSearch } = useRecentSearches();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['globalSearch', debouncedValue],
        queryFn: async () => {
            logger.info(`[HeaderSearch] Executing search query for term: "${debouncedValue}"`);
            try {
                const { data } = await axios.get(`/api/search?q=${debouncedValue}`);
                logger.info(`[HeaderSearch] Successfully fetched search data for "${debouncedValue}".`, data);
                return data;
            } catch (err) {
                logger.error(`[HeaderSearch] FAILED to fetch search results for "${debouncedValue}".`, { 
                    message: err.message, 
                    response: err.response?.data 
                });
                throw err;
            }
        },
       enabled: isSearchOpen,
        onSuccess: (data) => { 
            const resultCount = (data?.coaches?.length || 0) + (data?.programs?.length || 0) + (data?.connections?.length || 0) + (data?.bookings?.length || 0) + (data?.users?.length || 0) + (data?.navigation?.length || 0);
            logger.info(`[HeaderSearch] Search successful for "${debouncedValue}". Found ${resultCount} total items.`, { data });
        }
    });

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                logger.info('[HeaderSearch] Keyboard shortcut (Cmd/Ctrl+K) detected. Toggling search.');
                setIsSearchOpen(prev => !prev);
            } else if (e.key === 'Escape') {
                logger.info('[HeaderSearch] Escape key detected. Closing search.');
                setIsSearchOpen(false);
            }
        };

        const handleClickOutside = (event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                setIsSearchOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        logger.info(`[HeaderSearch] isSearchOpen state changed to: ${isSearchOpen}`);
        if (isSearchOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            logger.debug('[HeaderSearch] Search closed, resetting search value.');
            setValue('');
        }
    }, [isSearchOpen]);

    const handleSelect = (path) => {
        logger.info(`[HeaderSearch] Result selected. Navigating to path: "${path}"`);
        const searchTerm = value.trim();
        if (searchTerm) {
            addRecentSearch(searchTerm);
        }
        setIsSearchOpen(false);
        navigate(path);
    };
    
    const ResultItem = ({ path, onClick, children }) => (
        <Link to={path} onClick={(e) => { e.preventDefault(); onClick(); }}>
            <CommandItem onSelect={onClick} className="flex items-center gap-x-4 p-2 cursor-pointer">
                {children}
            </CommandItem>
        </Link>
    );

    const renderGroup = (title, items, icon) => {
        if (!items || items.length === 0) return null;
        const Icon = icon;
        return (
            <CommandGroup>
                {items.map(item => {
                    const finalPath = getProfilePath(item);
                    return (
                        <ResultItem key={`${item.type}-${item._id || item.path}`} path={finalPath} onClick={() => handleSelect(finalPath)}>
                            {item.avatar ? (
                                <Avatar className="h-8 w-8"><AvatarImage src={item.avatar} alt={item.name} /><AvatarFallback>{getInitials(item.name)}</AvatarFallback></Avatar>
                            ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full"><Icon className="h-4 w-4 text-foreground" /></div>
                            )}
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    <Highlight text={item.name} match={debouncedValue} />
                                </p>
                                {item.detail && <p className="text-xs text-muted-foreground">
                                    <Highlight text={item.detail} match={debouncedValue} />
                                </p>}
                            </div>
                        </ResultItem>
                    );
                })}
            </CommandGroup>
        );
    };

    const hasResults = data && (data.coaches?.length > 0 || data.users?.length > 0 || data.connections?.length > 0 || data.programs?.length > 0 || data.bookings?.length > 0 || data.navigation?.length > 0 || data.actions?.length > 0);

    return (
        <div ref={searchContainerRef} className="relative h-9">
            <div className="flex items-center justify-end">
                <AnimatePresence>
                    {isSearchOpen && (
                        <motion.div
                            key="search-input"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 'clamp(10rem, 20vw, 16rem)', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                        >
                            <Input
                                ref={inputRef}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={t('placeholder')}
                                className="h-9 w-full rounded-full"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
                <Button
                    onClick={() => setIsSearchOpen(prev => !prev)}
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-9 w-9 rounded-full transition-colors",
                        isSearchOpen && 'bg-accent text-accent-foreground'
                    )}
                >
                    <Search size={20} />
                </Button>
            </div>


            {isSearchOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full right-0 mt-2 w-[clamp(18rem,40vw,28rem)] z-50 rounded-lg border bg-popover text-popover-foreground shadow-md"
                >
                    <Command className="rounded-lg">
                        <CommandList className="max-h-[50vh]">
                            {isLoading && <div className="p-4 text-center text-sm">{t('loading')}</div>}
                            
                            {!isLoading && !hasResults && debouncedValue.length > 0 && (
                                <CommandEmpty>{t('noResults', { query: debouncedValue })}</CommandEmpty>
                            )}

                            {!isLoading && !hasResults && debouncedValue.length === 0 && recentSearches.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">{t('prompt')}</div>
                            )}

                            {!isLoading && debouncedValue.length === 0 && recentSearches.length > 0 && (
                                <CommandGroup heading={t('groupHeadings.recent')}>
                                    {recentSearches.map(search => (
                                        <CommandItem 
                                            key={search.id} 
                                            onSelect={() => setValue(search.term)} 
                                            className="flex items-center gap-x-2 p-2 cursor-pointer"
                                        >
                                            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="truncate">{search.term}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                            
                            {hasResults && (
                              <>
                                  {renderGroup(t('groupHeadings.actions'), data.actions, Search)}
                                  {renderGroup(t('groupHeadings.connections'), data.connections, User)}
                                  {renderGroup(t('groupHeadings.bookings'), data.bookings, CalendarCheck2)}
                                  {renderGroup(t('groupHeadings.coaches'), data.coaches, User)}
                                  {renderGroup(t('groupHeadings.users'), data.users, User)}
                                  {renderGroup(t('groupHeadings.programs'), data.programs, GraduationCap)}
                                  {renderGroup(t('groupHeadings.navigation'), data.navigation, Link2)}
                              </>
                            )}
                        </CommandList>
                    </Command>
                </motion.div>
            )}
        </div>
    );
};

const IconLink = ({ to, icon: Icon, label, 'aria-label': ariaLabel, children, onClick }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className="relative h-9 w-9 rounded-full text-slate-600 after:absolute after:bottom-[-0px] after:left-0 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-[#3498db] after:transition-transform after:duration-300 hover:text-primary hover:after:scale-x-100 focus-visible:outline-none dark:text-slate-300 dark:hover:text-primary dark:after:bg-[#60a5fa]" onClick={onClick}>
          <Link to={to} aria-label={ariaLabel}>
            <Icon size={20} />
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
IconLink.propTypes = {
  to: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  'aria-label': PropTypes.string.isRequired,
  children: PropTypes.node,
  onClick: PropTypes.func,
};

const Header = () => {
  const { t, i18n } = useTranslation(['common', 'header', 'availability', 'home']);
  const location = useLocation();
  const { user, isAuthenticated, userRole, userId, logout, updateUserContext } = useContext(AuthContext);
  const { socket, isConnected: socketConnected } = useNotificationSocket();
  const { notifications, fetchNotifications } = useNotifications();
  const { conversations } = useConversations();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [currentStatus, setCurrentStatus] = useState(user?.status || 'offline');
  const navigate = useNavigate();

  const isLaunched = process.env.REACT_APP_LAUNCHED === 'true';
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
  const [isOverLightBg, setIsOverLightBg] = useState(false);

  const handleLanguageChange = async (lang) => {
    if (!lang || i18n.language === lang) return;
    i18n.changeLanguage(lang);
    if (isAuthenticated && user) {
        try {
            const updatedUser = await updateUserDetails({ preferredLanguage: lang });
            if (updateUserContext) {
                updateUserContext(updatedUser);
            }
        } catch (error) {
            logger.error('Failed to update language preference:', error);
        }
    }
  };

  const languages = {
    en: { name: 'English' },
    de: { name: 'Deutsch' },
    fr: { name: 'Français' },
    it: { name: 'Italiano' },
  };

  const LanguageSwitcher = () => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-center gap-2">
                <Globe className="h-4 w-4" />
                <span className="truncate">{languages[i18n.language]?.name || 'Language'}</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            <DropdownMenuLabel>{t('header:language', 'Language')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {Object.entries(languages).map(([code, { name }]) => (
                <DropdownMenuItem key={code} onSelect={() => handleLanguageChange(code)} className="cursor-pointer">
                    <div className="flex w-full items-center justify-between">
                        <span>{name}</span>
                        {i18n.language === code && <Check className="h-4 w-4" />}
                    </div>
                </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
    </DropdownMenu>
  );
  
  const handleApplyCoachClick = () => {
    setIsSignupModalOpen(false);
    setIsCoachModalOpen(true);
  };

  const calendarPath = userRole === 'coach' ? `/manage-sessions/${userId}` : '/my-calendar';

   useEffect(() => {
        const isPrelaunchHomePage = location.pathname === '/' && !isLaunched;
        if (!isPrelaunchHomePage) {
            setIsOverLightBg(false);
            return;
        }

        const heroElement = document.getElementById('prelaunch-hero');
        if (!heroElement) return;

        const headerHeight = 65;

        const handleScroll = () => {
            const triggerPoint = heroElement.offsetHeight - headerHeight;
            if (window.scrollY > triggerPoint) {
                setIsOverLightBg(true);
            } else {
                setIsOverLightBg(false);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll);
        
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
        };
    }, [location.pathname, isLaunched]);

  useEffect(() => {
    if (user?.status) {
        setCurrentStatus(user.status);
    }
  }, [user?.status]);

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchNotifications();
    }
  }, [isAuthenticated, userId, fetchNotifications]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      const initialUnread = notifications.filter(n => !n.isRead).length;
      setUnreadNotificationsCount(initialUnread);
    } else {
      setUnreadNotificationsCount(0);
    }
  }, [notifications, userId, isAuthenticated]);

  const totalUnreadMessages = useMemo(() => {
    if (!isAuthenticated || !conversations) return 0;
    return conversations.reduce((sum, conv) => sum + (Number(conv.unreadCount) || 0), 0);
  }, [conversations, isAuthenticated]);

  useEffect(() => {
    if (!socket || !socketConnected || !isAuthenticated) return;
    const handleNewNotification = (notification) => {
      if (!notification.isRead) setUnreadNotificationsCount(prev => prev + 1);
    };
    const handleBatchRead = (data) => {
      setUnreadNotificationsCount(prev => Math.max(0, prev - data.notificationIds.length));
    };
    socket.on('notification', handleNewNotification);
    socket.on('notification_read_batch', handleBatchRead);
    return () => {
      socket.off('notification', handleNewNotification);
      socket.off('notification_read_batch', handleBatchRead);
    };
  }, [socket, socketConnected, isAuthenticated]);

  const handleLogout = async () => {
    try {
      await logoutUser();
      if (userId && socket) emitEvent(socket, 'logout', { userId });
      await logout();
      setMobileMenuOpen(false);
      setDesktopMenuOpen(false);
      navigate('/login');
    } catch (error) {
      logger.error('[Header] Logout failed', { error: error.message, userId });
    }
  };

  const handleMobileLinkClick = () => setMobileMenuOpen(false);
  const handleDesktopLinkClick = () => setDesktopMenuOpen(false);

  const statuses = {
    online: { label: t('availability:online'), textColor: 'text-green-500', bgColor: 'bg-green-500' },
    on_break: { label: t('availability:on_break', 'On a Break'), textColor: 'text-yellow-500', bgColor: 'bg-yellow-500' },
    busy: { label: t('availability:busy'), textColor: 'text-red-500', bgColor: 'bg-red-500' },
    offline: { label: t('availability:offline'), textColor: 'text-slate-500', bgColor: 'bg-slate-500' },
  };

const handleStatusChange = async (newStatus) => {
    if (!user || currentStatus === newStatus) return;
    const previousStatus = currentStatus;
    setCurrentStatus(newStatus);
    try {
      await updateUserStatus(newStatus);
      if(updateUserContext) updateUserContext({ ...user, status: newStatus });
    } catch (error) {
      logger.error('Error updating status:', { error: error.message, userId: user._id });
      setCurrentStatus(previousStatus);
    }
  };

  const renderPrimaryNavLinks = (isMobile = false, onLinkClick = () => {/*test*/}) => {
    const baseLinkClass = isMobile
      ? "flex items-center gap-4 rounded-lg p-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
      : "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-[#3498db] dark:after:bg-[#60a5fa] after:transition-transform after:duration-300 hover:text-slate-900 hover:after:scale-x-100 dark:text-slate-300 dark:hover:text-white";
    const activeLinkClass = isMobile
      ? "font-semibold text-[#3498db] bg-[#3498db]/10 dark:text-[#60a5fa] dark:bg-[#60a5fa]/10"
      : "font-semibold text-slate-900 after:scale-x-100 dark:text-white";
    const commonProps = {
      className: ({ isActive }) => cn(baseLinkClass, isActive && activeLinkClass),
      onClick: onLinkClick
    };

    if (!isAuthenticated) {
      return (
        <>
          <NavLink to="/coaches" {...commonProps}><Users className="h-5 w-5" />{t('header:findCoaches')}</NavLink>
          <NavLink to="/programs" {...commonProps}><GraduationCap className="h-5 w-5"/>{t('programs', { ns: 'common' })}</NavLink>
          <NavLink to="/how-it-works" {...commonProps}><HelpCircle className="h-5 w-5" />{t('header:howItWorks', 'How It Works')}</NavLink>
        </>
      );
    }
    switch (userRole) {
      case 'admin':
        return <NavLink to="/admin/overview" {...commonProps}><LayoutDashboard className="h-5 w-5" />{t('header:adminDashboard')}
        </NavLink>;
case 'coach':
        return (
          <>
            <NavLink to="/dashboard" {...commonProps}><LayoutDashboard className="h-5 w-5" />{t('header:dashboard')}</NavLink>
            <NavLink to={`/manage-sessions/${userId}`} {...commonProps}><Briefcase className="h-5 w-5" />{t('header:manageSessions')}</NavLink>
            <NavLink to="/coach/programs" {...commonProps}><GraduationCap className="h-5 w-5"/>{t('programs', { ns: 'common' })}</NavLink>
          </>
        );
      default:
        return (
          <>
            <NavLink to="/dashboard" {...commonProps}><LayoutDashboard className="h-5 w-5" />{t('header:dashboard')}</NavLink>
            <NavLink to="/coaches" {...commonProps}><Users className="h-5 w-5" />{t('header:findCoaches')}</NavLink>
            <NavLink to="/programs" {...commonProps}><GraduationCap className="h-5 w-5"/>{t('programs', { ns: 'common' })}</NavLink>
          </>
        );
    }
  };

  const badge = (count) => (
    count > 0 && <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background">{count > 9 ? '9+' : count}</span>
  );

  const SideMenuContent = ({ onLinkClick }) => {
    const navLinkClass = ({ isActive }) => cn("flex items-center gap-4 rounded-lg p-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800", isActive && "font-semibold text-[#3498db] bg-[#3498db]/10 dark:text-[#60a5fa] dark:bg-[#60a5fa]/10");
    const dashboardNavLinkClass = ({ isActive }) => cn(navLinkClass({isActive: false}), isActive && location.pathname === '/dashboard' && location.search === '' && "font-semibold text-[#3498db] bg-[#3498db]/10 dark:text-[#60a5fa] dark:bg-[#60a5fa]/10");

    return (
      <div className="flex h-full w-full flex-col">
    
<div className="p-4 border-b">
  <Link to="/" className="block" onClick={() => { setMobileMenuOpen(false); setDesktopMenuOpen(false); }}>
  <img
    src={location.pathname === '/' ? logo : logotrans}
    alt="Bondigoo Logo"
    className={location.pathname === '/' ? "h-10 w-auto" : "h-7 w-7"}
  />
</Link>
</div>
   
        
        <div className="flex-grow overflow-y-auto px-4 py-2">
          <nav className="flex flex-col gap-1">
            {isAuthenticated ? (
              <>
                <div className="mb-2 flex flex-col space-y-1 rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm font-semibold leading-none">{user?.name || t('header:user', 'User')}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="mt-2 h-auto justify-start p-0 text-sm font-medium">
                          <div className={cn('mr-2 h-2 w-2 rounded-full', statuses[currentStatus]?.bgColor)} />
                          <span>{statuses[currentStatus]?.label}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56">
                        <DropdownMenuLabel>{t('availability:set_status', 'Set Status')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {Object.entries(statuses).map(([statusKey, statusValue]) => (
                          <DropdownMenuItem key={statusKey} onSelect={() => handleStatusChange(statusKey)} className="cursor-pointer">
                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center gap-2"><div className={cn('h-2 w-2 rounded-full', statusValue.bgColor)} /><span>{statusValue.label}</span></div>
                              {currentStatus === statusKey && <Check className="h-4 w-4" />}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                
                {renderPrimaryNavLinks(true, onLinkClick)}
                <div className="my-2 h-px bg-border" />
               
                <NavLink to="/profile" className={navLinkClass} onClick={onLinkClick}><User className="h-5 w-5" />{t('header:profile')}</NavLink>
                <NavLink to="/connections" className={navLinkClass} onClick={onLinkClick}><Users className="h-5 w-5"/>{t('header:connections')}</NavLink>
                <NavLink to={calendarPath} className={navLinkClass} onClick={onLinkClick}><Calendar className="h-5 w-5" />{t('header:calendar')}</NavLink>
                <NavLink to="/messages" className={navLinkClass} onClick={onLinkClick}>
                    <MessageCircle className="h-5 w-5" /><span className="flex-1">{t('header:messages')}</span>
                    {totalUnreadMessages > 0 && (<span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">{totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}</span>)}
                </NavLink>
                <NavLink to="/notifications" className={navLinkClass} onClick={onLinkClick}>
                    <Bell className="h-5 w-5" /><span className="flex-1">{t('header:notifications')}</span>
                    {unreadNotificationsCount > 0 && (<span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">{unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}</span>)}
                </NavLink>
                <NavLink to="/settings" end className={navLinkClass} onClick={onLinkClick}><Settings className="h-5 w-5"/>{t('header:settings')}</NavLink>
                
                <div className="my-2 h-px bg-border" />
               
               
                
                {userRole === 'admin' && (
                  <><div className="my-2 h-px bg-border" /><NavLink to="/admin/overview" className={navLinkClass} onClick={onLinkClick}><LayoutDashboard className="h-5 w-5"/>{t('header:adminDashboard')}</NavLink></>
                )}
              </>
            ) : (
              <>
                {renderPrimaryNavLinks(true, onLinkClick)}
                <div className="my-2 h-px bg-border" />
                <div className="flex flex-col gap-2">
                   <Button variant="outline" asChild className="w-full justify-center gap-2 py-6 text-base" onClick={onLinkClick}>
                    <Link to="/login"><LogIn className="h-5 w-5" /><span>{t('header:login')}</span></Link>
                  </Button>
                  <Button asChild className="w-full justify-center gap-2 py-6 text-base">
                    <Link to="/signup"><UserPlus className="h-5 w-5" /><span>{t('header:register', 'Register')}</span></Link>
                  </Button>
                </div>
              </>
            )}
          </nav>
        </div>

        <div className="mt-auto border-t p-4">
          <div className="mb-4 space-y-4">
            <LanguageSwitcher />
            <div className="flex items-center justify-center rounded-lg bg-muted p-1">
              <Button onClick={() => setTheme('light')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'light' && 'bg-background text-foreground shadow-sm')}><Sun className="h-4 w-4" />{t('header:light', 'Light')}</Button>
              <Button onClick={() => setTheme('dark')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'dark' && 'bg-background text-foreground shadow-sm')}><Moon className="h-4 w-4" />{t('header:dark', 'Dark')}</Button>
              <Button onClick={() => setTheme('system')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'system' && 'bg-background text-foreground shadow-sm')}><Settings className="h-4 w-4" />{t('header:system', 'System')}</Button>
            </div>
          </div>
          {isAuthenticated && (
            <Button onClick={handleLogout} variant="ghost" className="w-full justify-start gap-4 p-3 text-base font-medium text-red-600 hover:text-red-600 focus:bg-red-100/50 dark:text-red-500 dark:hover:text-red-500 dark:focus:bg-red-500/10">
                <LogOut className="h-5 w-5" />{t('header:logout')}
            </Button>
          )}
        </div>
      </div>
    );
  };


const ThemeToggle = ({ className }) => (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("h-9 w-9 rounded-full", className)}>
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">{t('header:toggleTheme', 'Toggle Theme')}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('header:toggleTheme', 'Toggle Theme')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          <span>{t('header:light', 'Light')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          <span>{t('header:dark', 'Dark')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>{t('header:system', 'System')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

if (!isLaunched) {
    const navLinkClass = ({ isActive }) => cn(
        "flex items-center gap-4 rounded-lg p-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50",
        isActive && "font-semibold text-[#3498db] bg-[#3498db]/10 dark:text-[#60a5fa] dark:bg-[#60a5fa]/10"
    );

    return (
        <>
            <LaunchSignupModal isOpen={isSignupModalOpen} onOpenChange={setIsSignupModalOpen} onApplyCoachClick={handleApplyCoachClick} />
            <CoachApplicationModal isOpen={isCoachModalOpen} onOpenChange={setIsCoachModalOpen} onSuccess={() => setIsCoachModalOpen(false)} />
            <header className="fixed top-0 z-50 h-[65px] w-full px-4 transition-all duration-300 md:px-6">
                <div className="mx-auto flex h-full items-center justify-end">
                    {/* The logo has been removed from here to declutter the pre-launch view */}
                    <div className="flex items-center">
                        <Sheet open={isMobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className={cn(
                                    "h-9 w-9 rounded-full transition-colors",
                                    isOverLightBg
                                        ? "text-slate-500 hover:bg-accent hover:text-accent-foreground"
                                        : "text-white/90 hover:bg-white/10 hover:text-white"
                                )}>
                                    <Menu size={24} />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="p-0 sm:max-w-xs">
                                <div className="flex h-full flex-col">
                                    {/* The logo is now placed at the top of the slide-out menu */}
                                    <div className="border-b p-4">
                                        <Link
                                            to="/"
                                            className="flex items-center"
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <img src={logo} alt="Bondigoo Logo" className="h-7 w-auto" />
                                        </Link>
                                    </div>
                                    <div className="flex-grow overflow-y-auto px-4 pt-4 pb-4">
                                        <nav className="flex flex-col gap-1">
                                            <NavLink
                                                to="/how-it-works"
                                                className={navLinkClass}
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                <HelpCircle className="h-5 w-5" />
                                                {t('header:howItWorks', 'How It Works')}
                                            </NavLink>
                                            <button
                                                onClick={() => {
                                                    setMobileMenuOpen(false);
                                                    setIsSignupModalOpen(true);
                                                }}
                                                className="flex w-full items-center gap-4 rounded-lg p-3 text-left text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                                            >
                                                <UserPlus className="h-5 w-5" />
                                                <span>{t('home:prelaunch.hero.mainCta', 'Join Our Launch')}</span>
                                            </button>
                                        </nav>
                                    </div>
                                    <div className="mt-auto border-t p-4">
                                        <div className="space-y-4">
                                            <LanguageSwitcher />
                                            <div className="flex items-center justify-center rounded-lg bg-muted p-1">
                                                <Button onClick={() => setTheme('light')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'light' && 'bg-background text-foreground shadow-sm')}><Sun className="h-4 w-4" />{t('header:light', 'Light')}</Button>
                                                <Button onClick={() => setTheme('dark')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'dark' && 'bg-background text-foreground shadow-sm')}><Moon className="h-4 w-4" />{t('header:dark', 'Dark')}</Button>
                                                <Button onClick={() => setTheme('system')} variant="ghost" size="sm" className={cn("flex-1 justify-center gap-2", theme === 'system' && 'bg-background text-foreground shadow-sm')}><Settings className="h-4 w-4" />{t('header:system', 'System')}</Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </header>
        </>
    );
}

return (
    <header className="relative z-50 h-[65px] w-full border-b bg-gradient-subtle px-4 transition-colors md:px-6">
      <div className="mx-auto flex h-full items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/">
            <img
                src={location.pathname === '/' ? logo : logotrans}
                alt="Bondigoo Logo"
                className={location.pathname === '/' ? "h-10 w-auto" : "h-7 w-7"}
              />
          </Link>
        </div>

         <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 lg:flex">
            {renderPrimaryNavLinks(false)}
          </nav>
          
          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <>
                <HeaderSearch />
                <IconLink to={calendarPath} icon={Calendar} label={t('header:calendar')} aria-label={t('header:calendar')} />
                
                <IconLink to="/messages" icon={MessageCircle} label={t('header:messages')} aria-label={t('header:messages')}>
                  {badge(totalUnreadMessages)}
                </IconLink>
                <MenuAnnouncementBadge>
                  <IconLink to="/notifications" icon={Bell} label={t('header:notifications')} aria-label={t('header:notifications')}>
                    {badge(unreadNotificationsCount)}
                  </IconLink>
                </MenuAnnouncementBadge>
                <IconLink to="/profile" icon={User} label={t('header:profile')} aria-label={t('header:profile')} />
                
                <DropdownMenu>
                  <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full focus-visible:outline-none">
                                      <Circle className={cn('h-4 w-4', statuses[currentStatus]?.textColor)} />
                                  </Button>
                              </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent><p>{t('availability:status')}: {statuses[currentStatus]?.label}</p></TooltipContent>
                      </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuLabel>{t('availability:set_status', 'Set Status')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {Object.entries(statuses).map(([statusKey, statusValue]) => (
                          <DropdownMenuItem key={statusKey} onSelect={(e) => { e.preventDefault(); handleStatusChange(statusKey); }} className="cursor-pointer">
                              <div className="flex w-full items-center justify-between">
                                  <div className="flex items-center gap-2">
                                      <div className={cn('h-2 w-2 rounded-full', statusValue.bgColor)} />
                                      <span>{statusValue.label}</span>
                                  </div>
                                  {currentStatus === statusKey && <Check className="h-4 w-4" />}
                              </div>
                          </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ThemeToggle />
                <Sheet open={isDesktopMenuOpen} onOpenChange={setDesktopMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Menu size={24} className="text-slate-600 dark:text-slate-300 focus-visible:outline-none" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 sm:max-w-xs">
                    <SheetHeader>
                      <SheetTitle className="sr-only">{t('header:menu.title', 'Menu')}</SheetTitle>
                      <SheetDescription className="sr-only">{t('header:menu.description', 'A list of links to navigate the site.')}</SheetDescription>
                    </SheetHeader>
                    <SideMenuContent onLinkClick={handleDesktopLinkClick} />
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <>
                <ThemeToggle />
                 <Button asChild>
                  <Link to="/signup" className="flex items-center gap-2">
                    <UserPlus size={16} />
                    <span>{t('header:register', 'Register')}</span>
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/login" className="flex items-center gap-2">
                    <LogIn size={16} />
                    <span>{t('header:login')}</span>
                  </Link>
                </Button>
               
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1 lg:hidden">
            {isAuthenticated && <HeaderSearch />}
            <ThemeToggle />
            <Sheet open={isMobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Toggle menu">
                  <Menu size={24} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 sm:max-w-xs">
                 <SheetHeader>
                    <SheetTitle className="sr-only">{t('header:menu.title', 'Menu')}</SheetTitle>
                    <SheetDescription className="sr-only">{t('header:menu.description', 'A list of links to navigate the site.')}</SheetDescription>
                  </SheetHeader>
                 <SideMenuContent onLinkClick={handleMobileLinkClick} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;