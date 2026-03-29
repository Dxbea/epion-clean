// src/router.tsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';
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

  if (loading) return <div className="p-6 text-sm opacity-70">Loading…</div>;
  if (!me) return <Navigate to="/settings#account" replace />;

  return children;
}

export default function Router(): React.ReactElement {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* --- pages publiques Core (Eager) --- */}
        <Route path="/" element={<Home />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/category" element={<CategoryIndex />} />
        <Route path="/news/favorites" element={<Favorites />} />
        <Route path="/news/categories" element={<Categories />} />
        <Route path="/news/:slug" element={<NewsSlug />} />
        <Route path="/news/saved" element={<Saved />} />
        <Route
          path="/saved"
          element={<Navigate to="/news/saved" replace />}
        />

        {/* --- Lazy Loaded Pages --- */}
        <Route
          path="*"
          element={
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* --- Search & Articles --- */}
                <Route path="/news/search" element={<SearchPage />} />

                {/* article en lecture */}
                <Route
                  path="/article/:slug"
                  element={
                    <RequireAuth>
                      <Article />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/article/:id"
                  element={
                    <RequireAuth>
                      <Article />
                    </RequireAuth>
                  }
                />

                {/* création (réservée aux comptes connectés) */}
                <Route
                  path="/create"
                  element={
                    <RequireAuth>
                      <CreateArticle />
                    </RequireAuth>
                  }
                />

                {/* édition depuis l’espace compte */}
                <Route
                  path="/account/articles/:idOrSlug/edit"
                  element={<EditArticlePage />}
                />

                {/* édition depuis une URL “actualité” */}
                <Route
                  path="/news/article/:idOrSlug/edit"
                  element={<EditArticlePage />}
                />

                {/* fallback ancien format */}
                <Route
                  path="/article/:idOrSlug/edit"
                  element={<EditArticlePage />}
                />

                {/* --- compte / user --- */}
                <Route
                  path="/account"
                  element={
                    <RequireAuth>
                      <MyAccount />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/activity"
                  element={
                    <RequireAuth>
                      <Activity />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/account/articles"
                  element={
                    <RequireAuth>
                      <MyArticlesPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/account/saved"
                  element={<Navigate to="/activity?tab=SAVED" replace />}
                />

                {/* --- Public Profile --- */}
                <Route path="/u/:userId" element={<Profile />} />

                {/* --- chat (PLUS DE REQUIREAUTH ICI) --- */}
                <Route path="/chat" element={<Chat />} />
                <Route path="/chat/:id" element={<ChatSession />} />

                {/* --- settings / légal / divers --- */}
                <Route path="/settings" element={<Settings />} />
                <Route path="/legal/terms" element={<TermsPage />} />
                <Route path="/legal/privacy" element={<PrivacyPage />} />
                <Route path="/legal" element={<LegalPage />} />
                <Route path="/legal/moderation" element={<ModerationPolicy />} />
                <Route path="/legal/cookies" element={<Cookies />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/download" element={<Download />} />
                <Route path="/changelog" element={<Changelog />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/transparency" element={<Transparency />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/press" element={<Press />} />

                {/* reset password */}
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
