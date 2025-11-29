// src/router.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layout/MainLayout';

import Home from '../pages/Home';
import Actuality from '../pages/Actuality';
import Talking from '../pages/Talking';
import Settings from '../pages/Settings';
import MyAccount from '../pages/Account/MyAccount';
import Category from '../pages/Category';
import Search from '../pages/Search';
import Article from '../pages/Article';
import ActualitySlug from '../pages/ActualitySlug';
import Categories from '../pages/Categories';
import CreateArticle from '../pages/CreateArticle';
import Saved from '../pages/Saved';
import CategoryIndex from '../pages/CategoryIndex';
import Favorites from '../pages/Favorites';
import Chat from '../pages/Chat';
import ChatSession from '../pages/ChatSession';

import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import LegalPage from '@/pages/LegalPage';
import AboutPage from '@/pages/AboutPage';
import HelpPage from '@/pages/HelpPage';
import Download from '../pages/Download';
import Changelog from '../pages/Changelog';
import Guide from '../pages/Guide';
import Blog from '../pages/Blog';
import Transparency from '../pages/Transparency';
import Contact from '../pages/Contact';
import ModerationPolicy from '../pages/ModerationPolicy';
import Press from '../pages/Press';
import Cookies from '../pages/Cookies';
import SearchPage from '@/pages/Search';

import EditArticlePage from '@/pages/EditArticle';
import MyArticlesPage from '@/pages/MyArticlesPage';
import FavoritesPage from '@/pages/FavoritesPage';
import { useMe } from '@/contexts/MeContext';
import ResetPassword from '../pages/ResetPassword';
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
        {/* --- pages publiques --- */}
        <Route path="/" element={<Home />} />
        <Route path="/actuality" element={<Actuality />} />
        <Route path="/actuality/category" element={<CategoryIndex />} />
        <Route path="/actuality/favorites" element={<Favorites />} />
        <Route path="/actuality/categories" element={<Categories />} />
        <Route path="/actuality/:slug" element={<ActualitySlug />} />
        <Route path="/actuality/saved" element={<Saved />} />
        <Route path="/actuality/search" element={<SearchPage />} />
        <Route
          path="/saved"
          element={<Navigate to="/actuality/saved" replace />}
        />

        {/* article en lecture */}
        <Route path="/article/:slug" element={<Article />} />
        <Route path="/article/:id" element={<Article />} />

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
          path="/actuality/article/:idOrSlug/edit"
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
          path="/account/articles"
          element={
            <RequireAuth>
              <MyArticlesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account/saved"
          element={
            <RequireAuth>
              <FavoritesPage />
            </RequireAuth>
          }
        />

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

        {/* fallback éventuel */}
        {/* <Route path="*" element={<NotFound />} /> */}
      </Route>
    </Routes>
  );
}

console.log('Router chargé');
