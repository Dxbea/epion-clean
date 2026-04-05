import React, { JSX, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';
import { FaApple, FaWindows, FaAndroid } from 'react-icons/fa';
import './Home.css';

export default function Home(): JSX.Element {
  const { t } = useI18n();

  // Prefetch logic
  const prefetchChat = () => import('./Chat');
  const prefetchArticles = () => import('./news');

  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    const timer = setTimeout(() => {
      prefetchChat();
      prefetchArticles();
      prefetchedRef.current = true;
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // IntersectionObserver for Why Epion blocks
  const whySectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = whySectionRef.current;
    if (!section) return;
    const blocks = section.querySelectorAll('.why-block');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.2 }
    );
    blocks.forEach((b) => observer.observe(b));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-snap-container w-full relative">

      {/* Background Decor: 2 Magnifying glasses */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="bg-magnifier-tr animate-pulse-float"></div>
        <div className="bg-magnifier-bl animate-pulse-float-flipped delay-700"></div>
      </div>

      {/* BLOCK 1: Being informed — text left, images right */}
      <section className="home-snap-section px-6 md:px-16 lg:px-32 z-10 pt-24 pb-12">
        <div className="w-full flex flex-col md:flex-row items-center md:items-start gap-10 lg:gap-16">
          {/* Text */}
          <div className="flex-1 animate-fade-up flex flex-col items-start text-left mt-10">
            <h1 className="text-5xl md:text-[3.5rem] lg:text-[4.5rem] xl:text-[5rem] font-medium tracking-tight mb-6">
              {t('home_informed_title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg sm:text-xl max-w-lg leading-relaxed mb-6">
              {t('home_informed_desc')}
            </p>
            <Link
              to="/news"
              onMouseEnter={prefetchArticles}
              className="w-full sm:w-auto md:w-[22rem] inline-flex items-center justify-center bg-black text-white dark:bg-white dark:text-black font-semibold px-8 py-3 rounded-full text-lg whitespace-nowrap hover:scale-105 active:scale-95 transition-all outline-none shadow-md hover:shadow-lg"
            >
              {t('home_read_articles')}
            </Link>
          </div>
          {/* Images — stacked / overlapping */}
          <div className="flex-shrink-0 w-full md:w-[45%] lg:w-[40%] relative min-h-[350px] md:min-h-[450px] animate-fade-up delay-200 mt-12 md:mt-0">
            <img src="/img/IMG4.png" alt="Feed Epion" className="absolute top-0 right-0 md:-right-4 w-[65%] md:w-[75%] rounded-2xl border border-gray-200 dark:border-gray-800 object-cover" />
            <img src="/img/IMG1.png" alt="Article content" className="absolute top-24 md:top-36 right-[15%] md:right-[20%] w-[55%] md:w-[60%] rounded-2xl border border-gray-200 dark:border-gray-800 object-cover" />
          </div>
        </div>
      </section>

      {/* BLOCK 2: Forget traditionals — text left, images right */}
      <section className="px-6 md:px-16 lg:px-32 z-10 pt-12 pb-24">
        <div className="w-full flex flex-col md:flex-row items-center md:items-start gap-10 lg:gap-16">
          {/* Text */}
          <div className="flex-1 animate-fade-up delay-100 flex flex-col items-start text-left">
            <h2 className="text-5xl md:text-[3.5rem] lg:text-[4.5rem] xl:text-[5rem] font-medium tracking-tight mb-6">
              {t('home_ai_chat_title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg sm:text-xl max-w-lg leading-relaxed mb-6">
              {t('home_ai_chat_desc')}
            </p>
            <Link
              to="/chat"
              onMouseEnter={prefetchChat}
              className="w-full sm:w-auto md:w-[22rem] inline-flex items-center justify-center bg-black text-white dark:bg-white dark:text-black font-semibold px-8 py-3 rounded-full text-lg whitespace-nowrap hover:scale-105 active:scale-95 transition-all outline-none shadow-md hover:shadow-lg"
            >
              {t('home_open_ai_chat')}
            </Link>

            {/* BLOCK 2b: Everywhere anytime + download buttons (Moved inside left column) */}
            <div className="mt-20 md:mt-32">
              <h2 className="text-4xl sm:text-5xl md:text-[3.5rem] lg:text-[4rem] xl:text-[4.5rem] font-medium tracking-tight mb-10">
                {t('home_access_everywhere')}
              </h2>
              <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
                <div className="flex flex-col items-start gap-4">
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm tracking-wide uppercase">{t('home_on_desktop')}</p>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="outline" className="rounded-full px-5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                      <FaWindows className="mr-2" /> Windows
                    </Button>
                    <Button variant="outline" className="rounded-full px-5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                      <FaApple className="mr-2 mb-[2px]" /> Mac
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-4">
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm tracking-wide uppercase">{t('home_on_mobile')}</p>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="outline" className="rounded-full px-6 py-2 h-auto text-base hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                      <FaApple className="mr-2 mb-[2px]" /> iOS
                    </Button>
                    <Button variant="outline" className="rounded-full px-6 py-2 h-auto text-base hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                      <FaAndroid className="mr-2" /> Android
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Images — stacked / overlapping */}
          <div className="flex-shrink-0 w-full md:w-[45%] lg:w-[40%] relative min-h-[400px] md:min-h-[550px] animate-fade-up delay-300 mt-12 md:mt-0">
            <img src="/img/IMG1.png" alt="AI Summary" className="absolute top-0 right-[10%] md:right-[15%] w-[70%] rounded-2xl border border-gray-200 dark:border-gray-800 object-cover" />
            <img src="/img/IMG6.png" alt="AI Generation Context" className="absolute top-32 md:top-44 right-[0%] md:right-[-5%] w-[55%] rounded-2xl border border-gray-200 dark:border-gray-800 object-cover" />
          </div>
        </div>
      </section>

      {/* BLOCK 3: Why epion? */}
      <section ref={whySectionRef} className="home-snap-section-auto px-6 md:px-16 lg:px-32 z-10 max-w-7xl mx-auto w-full">

        {/* Title on top */}
        <h2 className="text-[3.5rem] md:text-[4rem] lg:text-[5rem] font-medium tracking-tight text-center mb-16 md:mb-24">
          {t('home_why_title')}
        </h2>

        {/* Alternating blocks */}
        <div className="flex flex-col gap-16 md:gap-24 pb-32">
          {[
            {
              num: "1.",
              title: t('home_why_1_title'),
              text: t('home_why_1_desc'),
              color: '#38A6A6',
              align: 'left'
            },
            {
              num: "2.",
              title: t('home_why_2_title'),
              text: t('home_why_2_desc'),
              color: '#58C1C4',
              align: 'right'
            },
            {
              num: "3.",
              title: t('home_why_3_title'),
              text: t('home_why_3_desc'),
              color: '#78DCE3',
              align: 'left'
            },
            {
              num: "4.",
              title: t('home_why_4_title'),
              text: t('home_why_4_desc'),
              color: '#A1E3A2',
              align: 'right'
            },
            {
              num: "5.",
              title: t('home_why_5_title'),
              text: t('home_why_5_desc'),
              color: '#CBEA62',
              align: 'left'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className={`why-block max-w-xl p-8 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-100 dark:border-gray-800 ${item.align === 'right' ? 'md:ml-auto' : 'md:mr-auto'
                }`}
            >
              <h3 className="mb-4 text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
                <span style={{ color: item.color }} className="mr-3 font-medium text-xl opacity-90">{item.num}</span>
                {item.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-base md:text-lg">{item.text}</p>
            </div>
          ))}
        </div>

      </section>

      {/* FEATURES: The 4 Pillars of Epion */}
      <section className="px-6 md:px-16 lg:px-32 py-24 z-10 bg-gray-50/50 dark:bg-neutral-900/20 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col gap-32">

          {/* Feature 1: Feed */}
          <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-6 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-medium tracking-tight leading-[1.1]">
                {t('home_feed_title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                {t('home_feed_desc')}
              </p>
            </div>
            <div className="flex-1 w-full relative group">
              <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-400/5 rounded-3xl blur-2xl group-hover:bg-blue-500/10 transition-colors duration-500"></div>
              <div className="w-full aspect-[4/3] bg-white dark:bg-black rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden relative z-10 shadow-sm transition-all duration-500 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-xl">
                <img src="/img/IMG4.png" alt="Interface du Feed" className="w-full h-full object-cover object-top" />
              </div>
            </div>
          </div>

          {/* Feature 2: Creation */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-6 text-center md:text-left md:pl-8 lg:pl-16">
              <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-medium tracking-tight leading-[1.1]">
                {t('home_creation_title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                {t('home_creation_desc')}
              </p>
            </div>
            <div className="flex-1 w-full relative group">
              <div className="absolute inset-0 bg-teal-500/5 dark:bg-teal-400/5 rounded-3xl blur-2xl group-hover:bg-teal-500/10 transition-colors duration-500"></div>
              <div className="w-full aspect-[4/3] bg-white dark:bg-black rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden relative z-10 shadow-sm transition-all duration-500 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-xl">
                <img src="/img/IMG5.png" alt="Créateur d'article" className="w-full h-full object-cover object-top" />
              </div>
            </div>
          </div>

          {/* Feature 3: Chat */}
          <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-6 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-medium tracking-tight leading-[1.1]">
                {t('home_chat_title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                {t('home_chat_desc')}
              </p>
            </div>
            <div className="flex-1 w-full relative group">
              <div className="absolute inset-0 bg-purple-500/5 dark:bg-purple-400/5 rounded-3xl blur-2xl group-hover:bg-purple-500/10 transition-colors duration-500"></div>
              <div className="w-full aspect-[4/3] bg-white dark:bg-black rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden relative z-10 shadow-sm transition-all duration-500 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-xl">
                <img src="/img/IMG1.png" alt="Interface de Chat" className="w-full h-full object-cover object-top" />
              </div>
            </div>
          </div>

          {/* Feature 4: Transparency */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-6 text-center md:text-left md:pl-8 lg:pl-16">
              <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-medium tracking-tight leading-[1.1]">
                {t('home_transparency_title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                {t('home_transparency_desc')}
              </p>
            </div>
            <div className="flex-1 w-full relative group">
              <div className="absolute inset-0 bg-rose-500/5 dark:bg-rose-400/5 rounded-3xl blur-2xl group-hover:bg-rose-500/10 transition-colors duration-500"></div>
              <div className="w-full aspect-[4/3] bg-white dark:bg-black rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden relative z-10 shadow-sm transition-all duration-500 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-xl">
                <img src="/img/IMG3.png" alt="Score de Fiabilité" className="w-full h-full object-cover object-top" />
              </div>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}
