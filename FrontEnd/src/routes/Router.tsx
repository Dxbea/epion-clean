// src/router.tsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';
import AppLayout from '@/layout/AppLayout';
import PageLoader from '../components/ui/PageLoader';

// Eager loaded pages (Core / Landing / First Paint)
import Home from '../pages/Home';
import News from '../pages/news';
import CategoryIndex from '../pages/CategoryIndex';
import Categories from '../pages/Categories';
import Saved from '../pages/Saved';
import Favorites from '../pages/Favorites';
import NewsSlug from '../pages/newsSlug';

// Lazy loaded pages (Heavy bundles or secondary)
const Settings = React.lazy(() => import('../pages/Settings'));
const MyAccount = React.lazy(() => import('../pages/Account/MyAccount'));
const SearchPage = React.lazy(() => import('@/pages/Search'));
const Article = React.lazy(() => import('../pages/Article'));
const CreateArticle = React.lazy(() => import('../pages/CreateArticle'));
const EditArticlePage = React.lazy(() => import('@/pages/EditArticle'));
const MyArticlesPage = React.lazy(() => import('@/pages/MyArticlesPage'));
const Chat = React.lazy(() => import('../pages/Chat'));
const ChatSession = React.lazy(() => import('../pages/ChatSession'));
const Activity = React.lazy(() => import('@/pages/user/Activity'));
const Profile = React.lazy(() => import('@/pages/Profile'));
const AdminContributionReports = React.lazy(() => import('@/pages/AdminContributionReports'));

// Static pages (Lower priority but light)
const TermsPage = React.lazy(() => import('@/pages/TermsPage'));
const PrivacyPage = React.lazy(() => import('@/pages/PrivacyPage'));
const LegalPage = React.lazy(() => import('@/pages/LegalPage'));
const AboutPage = React.lazy(() => import('@/pages/AboutPage'));
const HelpPage = React.lazy(() => import('@/pages/HelpPage'));
const Download = React.lazy(() => import('../pages/Download'));
const Changelog = React.lazy(() => import('../pages/Changelog'));
const Guide = React.lazy(() => import('../pages/Guide'));
const Blog = React.lazy(() => import('../pages/Blog'));
const Transparency = React.lazy(() => import('../pages/Transparency'));
const Contact = React.lazy(() => import('../pages/Contact'));
const ModerationPolicy = React.lazy(() => import('../pages/ModerationPolicy'));
const Press = React.lazy(() => import('../pages/Press'));
const Cookies = React.lazy(() => import('../pages/Cookies'));
const ResetPassword = React.lazy(() => import('../pages/ResetPassword'));
const VerifyEmail = React.lazy(() => import('../pages/VerifyEmail'));

import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

function lazy(element: React.ReactElement): React.ReactElement {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { me, loading } = useMe();
  const { requireAuth } = useAuthPrompt();

  React.useEffect(() => {
    if (!loading && !me) {
      requireAuth({
        message: 'You need to sign in to access this page.',
      });
    }
  }, [loading, me, requireAuth]);

  if (loading) return <div className="p-6 text-sm opacity-70">Loading...</div>;
  if (!me) return <Navigate to="/settings#account" replace />;

  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { me, loading } = useMe();
  const { requireAuth } = useAuthPrompt();

  React.useEffect(() => {
    if (!loading && !me) {
      requireAuth({ message: 'You need to sign in to access this page.' });
    }
  }, [loading, me, requireAuth]);

  if (loading) return <div className="p-6 text-sm opacity-70">Loading...</div>;
  if (!me) return <Navigate to="/settings#account" replace />;
  if (me.role !== 'ADMIN') return <Navigate to="/" replace />;

  return children;
}

export default function Router(): React.ReactElement {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/legal/terms" element={lazy(<TermsPage />)} />
        <Route path="/legal/privacy" element={lazy(<PrivacyPage />)} />
        <Route path="/legal" element={lazy(<LegalPage />)} />
        <Route path="/legal/moderation" element={lazy(<ModerationPolicy />)} />
        <Route path="/legal/cookies" element={lazy(<Cookies />)} />
        <Route path="/about" element={lazy(<AboutPage />)} />
        <Route path="/help" element={lazy(<HelpPage />)} />
        <Route path="/download" element={lazy(<Download />)} />
        <Route path="/changelog" element={lazy(<Changelog />)} />
        <Route path="/guide" element={lazy(<Guide />)} />
        <Route path="/blog" element={lazy(<Blog />)} />
        <Route path="/transparency" element={lazy(<Transparency />)} />
        <Route path="/contact" element={lazy(<Contact />)} />
        <Route path="/press" element={lazy(<Press />)} />
      </Route>

      <Route element={<AppLayout />}>
        <Route path="/news" element={<News />} />
        <Route path="/news/category" element={<CategoryIndex />} />
        <Route path="/news/favorites" element={<Favorites />} />
        <Route path="/news/categories" element={<Categories />} />
        <Route path="/news/:slug" element={<NewsSlug />} />
        <Route path="/news/saved" element={<Saved />} />
        <Route path="/news/search" element={lazy(<SearchPage />)} />
        <Route path="/saved" element={<Navigate to="/news/saved" replace />} />

        <Route
          path="/article/:slug"
          element={lazy(
            <RequireAuth>
              <Article />
            </RequireAuth>,
          )}
        />
        <Route
          path="/article/:id"
          element={lazy(
            <RequireAuth>
              <Article />
            </RequireAuth>,
          )}
        />
        <Route
          path="/create"
          element={lazy(
            <RequireAuth>
              <CreateArticle />
            </RequireAuth>,
          )}
        />
        <Route path="/account/articles/:idOrSlug/edit" element={lazy(<EditArticlePage />)} />
        <Route path="/news/article/:idOrSlug/edit" element={lazy(<EditArticlePage />)} />
        <Route path="/article/:idOrSlug/edit" element={lazy(<EditArticlePage />)} />

        <Route
          path="/account"
          element={lazy(
            <RequireAuth>
              <MyAccount />
            </RequireAuth>,
          )}
        />
        <Route
          path="/activity"
          element={lazy(
            <RequireAuth>
              <Activity />
            </RequireAuth>,
          )}
        />
        <Route
          path="/account/articles"
          element={lazy(
            <RequireAuth>
              <MyArticlesPage />
            </RequireAuth>,
          )}
        />
        <Route path="/account/saved" element={<Navigate to="/activity?tab=SAVED" replace />} />
        <Route path="/u/:userId" element={lazy(<Profile />)} />

        <Route
          path="/admin/contribution-reports"
          element={lazy(
            <RequireAdmin>
              <AdminContributionReports />
            </RequireAdmin>,
          )}
        />

        <Route path="/chat" element={lazy(<Chat />)} />
        <Route path="/chat/:id" element={lazy(<ChatSession />)} />

        <Route path="/settings" element={lazy(<Settings />)} />
        <Route path="/settings/:category" element={lazy(<Settings />)} />
        <Route path="/reset-password" element={lazy(<ResetPassword />)} />
        <Route path="/verify-email" element={lazy(<VerifyEmail />)} />
      </Route>
    </Routes>
  );
}
