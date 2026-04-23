import React, { JSX, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa';

import { Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/hooks/useTheme';
import MagnifierBackground, { Magnifier } from '@/components/ui/MagnifierBackground';

import './Home.css';

export default function Home(): JSX.Element {
  const { t, locale } = useI18n();
  const { theme } = useTheme();

  const prefetchChat = () => import('./Chat');
  const prefetchArticles = () => import('./news');

  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (prefetchedRef.current) return;

    const timer = window.setTimeout(() => {
      prefetchChat();
      prefetchArticles();
      prefetchedRef.current = true;
    }, 2000);

    return () => window.clearTimeout(timer);
  }, []);

  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const landingImages = {
    heroFeed: isDarkMode ? '/img/Feed_Dark.png' : '/img/Feed_Light.png',
    heroChat: isDarkMode ? '/img/Chat_Dark.png' : '/img/Chat_Light.png',
    featureFeed: isDarkMode ? '/img/Feed_Dark.png' : '/img/Feed_Light.png',
    featureCreation: isDarkMode ? '/img/CreateArticle_Dark.png' : '/img/CreateArticle_Light.png',
    featureChat: isDarkMode ? '/img/Chat_Dark.png' : '/img/Chat_Light.png',
    featureTransparency: isDarkMode ? '/img/UnderstanSource_Dark.png' : '/img/UnderstandSource_Light.png',
  } as const;

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal], .why-block');
    if (!elements.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      elements.forEach((element) => element.classList.add('visible', 'revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('visible', 'revealed');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const whyItems = [
    {
      num: '1.',
      title: t('home_why_1_title'),
      text: t('home_why_1_desc'),
      color: '#38A6A6',
      gradientPosition: 'top left',
      align: 'left',
    },
    {
      num: '2.',
      title: t('home_why_2_title'),
      text: t('home_why_2_desc'),
      color: '#58C1C4',
      gradientPosition: 'top right',
      align: 'right',
    },
    {
      num: '3.',
      title: t('home_why_3_title'),
      text: t('home_why_3_desc'),
      color: '#78DCE3',
      gradientPosition: 'bottom left',
      align: 'left',
    },
    {
      num: '4.',
      title: t('home_why_4_title'),
      text: t('home_why_4_desc'),
      color: '#A1E3A2',
      gradientPosition: 'bottom right',
      align: 'right',
    },
    {
      num: '5.',
      title: t('home_why_5_title'),
      text: t('home_why_5_desc'),
      color: '#CBEA62',
      gradientPosition: 'center left',
      align: 'left',
    },
  ] as const;

  const featureSections = [
    {
      title: t('home_feed_title'),
      description: t('home_feed_desc'),
      imageSrc: landingImages.featureFeed,
      imageAlt: 'Interface du flux epion',
      glowClass: 'bg-blue-500/5 group-hover:bg-blue-500/10 dark:bg-blue-400/5',
      reverse: false,
    },
    {
      title: t('home_creation_title'),
      description: t('home_creation_desc'),
      imageSrc: landingImages.featureCreation,
      imageAlt: "Createur d'article epion",
      glowClass: 'bg-teal-500/5 group-hover:bg-teal-500/10 dark:bg-teal-400/5',
      reverse: true,
    },
    {
      title: t('home_chat_title'),
      description: t('home_chat_desc'),
      imageSrc: landingImages.featureChat,
      imageAlt: 'Interface de chat epion',
      glowClass: 'bg-cyan-500/5 group-hover:bg-cyan-500/10 dark:bg-cyan-400/5',
      reverse: false,
    },
    {
      title: t('home_transparency_title'),
      description: t('home_transparency_desc'),
      imageSrc: landingImages.featureTransparency,
      imageAlt: 'Vue du score de fiabilite epion',
      glowClass: 'bg-emerald-500/5 group-hover:bg-emerald-500/10 dark:bg-emerald-400/5',
      reverse: true,
    },
  ] as const;

  const heroTitleClass =
    'reveal mb-6 font-serif font-medium tracking-tight leading-tight text-5xl md:text-7xl';

  const sectionTitleClass =
    'reveal mb-6 font-serif font-light md:font-normal leading-[1.05] tracking-[-0.03em] text-balance [font-variation-settings:"opsz"_72,"wght"_300] md:[font-variation-settings:"opsz"_100,"wght"_400]';

  const featureTitleClass =
    'reveal font-serif font-light md:font-normal tracking-[-0.03em] leading-[1.08] text-balance [font-variation-settings:"opsz"_72,"wght"_300] md:[font-variation-settings:"opsz"_100,"wght"_400]';

  return (
    <div className="home-snap-container relative w-full overflow-hidden">
      <MagnifierBackground />

      <section className="home-snap-section z-10 px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-20 md:px-10 md:pt-36 md:pb-24 lg:px-16 lg:pt-40 lg:pb-28 xl:pb-32">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-12 xl:gap-16">
          <div className="flex flex-1 flex-col items-center gap-8 text-center lg:items-start lg:text-left lg:mt-0 lg:basis-[58%]">
            <h1 data-reveal className={heroTitleClass}>
              {locale === 'fr' ? (
                <>Comprendre,<br />pas juste consommer.</>
              ) : (
                <>Stop consuming.<br />Start understanding.</>
              )}
            </h1>
            <p data-reveal className="reveal reveal-delay-2 max-w-xl text-base leading-[1.7] text-gray-600 text-pretty dark:text-gray-400 sm:text-lg">
              {t('home_informed_desc')}
            </p>
            <div data-reveal className="reveal reveal-delay-3 w-full sm:w-auto md:w-[22rem]">
              <Button
                as={Link}
                to="/news"
                onMouseEnter={prefetchArticles}
                variant="primary"
                size="auto"
                className="w-full whitespace-nowrap rounded-full px-8 py-3 text-lg"
              >
                {t('home_read_articles')}
              </Button>
            </div>
          </div>

          <div data-reveal className="reveal reveal-delay-2 flex w-full flex-shrink-0 items-center justify-center mt-10 lg:mt-0 lg:basis-[42%]">
            <div className="home-showcase-card w-full max-w-[25rem] xl:max-w-[26rem]">
              <div className="home-showcase-glow"></div>
              <img
                src={landingImages.heroFeed}
                alt="Apercu du flux d'articles epion"
                className="home-showcase-image aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="z-10 px-4 pt-20 pb-8 sm:px-6 sm:pt-24 sm:pb-8 md:px-10 md:pt-28 md:pb-10 lg:px-16 lg:pt-32 lg:pb-12">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-col items-center gap-14 lg:flex-row lg:items-center lg:gap-12 xl:gap-16">
            <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left lg:basis-[58%]">
              <h2 data-reveal className={`${sectionTitleClass} max-w-[15ch] text-5xl md:text-6xl lg:max-w-[15ch] lg:text-[3.95rem] xl:text-[4.35rem]`}>
                {t('home_ai_chat_title')}
              </h2>
              <p data-reveal className="reveal reveal-delay-2 mb-7 max-w-xl text-base leading-[1.7] text-gray-600 text-pretty dark:text-gray-400 sm:text-lg">
                {t('home_ai_chat_desc')}
              </p>
              <div data-reveal className="reveal reveal-delay-3 w-full sm:w-auto md:w-[22rem]">
                <Button
                  as={Link}
                  to="/chat"
                  onMouseEnter={prefetchChat}
                  variant="primary"
                  size="auto"
                  className="w-full whitespace-nowrap rounded-full px-8 py-3 text-lg"
                >
                  {t('home_open_ai_chat')}
                </Button>
              </div>
            </div>

            <div data-reveal className="reveal reveal-delay-2 flex w-full flex-shrink-0 items-center justify-center lg:basis-[42%]">
              <div className="home-showcase-card home-showcase-card-chat w-full max-w-[26rem] overflow-hidden xl:max-w-[27.5rem]">
                <div className="home-showcase-glow"></div>
                <img
                  src={landingImages.heroChat}
                  alt="Apercu du chat epion"
                  className="home-showcase-image aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/5]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 py-24 sm:px-6 sm:py-28 md:px-10 md:py-32 lg:px-16 lg:py-36">
        {/* Magnifier 1: Access everywhere (Right side) */}
        <div className="absolute top-[10%] md:top-[20%] right-0 translate-x-[30%] sm:translate-x-[20%] lg:translate-x-[10%] w-[75vw] h-[75vw] max-w-[600px] max-h-[600px] min-w-[250px] min-h-[250px] opacity-20 dark:opacity-10 blur-[2px] pointer-events-none z-0">
          <Magnifier className="w-full h-full transform rotate-[5deg]" />
        </div>
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center">
          <h2
            data-reveal
            className={`${sectionTitleClass} mb-10 max-w-[15ch] text-4xl sm:text-5xl md:text-[3.35rem] lg:max-w-none lg:text-[3.7rem] xl:text-[4.1rem]`}
          >
            {t('home_access_everywhere')}
          </h2>
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-16">
            <div data-reveal className="reveal reveal-delay-1 flex flex-col items-center gap-4">
              <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('home_on_desktop')}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button
                  variant="primary"
                  size="auto"
                  className="py-2.5 px-6 rounded-full"
                >
                  <FaWindows className="mr-2" /> Windows
                </Button>
                <Button
                  variant="primary"
                  size="auto"
                  className="py-2.5 px-6 rounded-full"
                >
                  <FaApple className="mr-2 mb-[2px]" /> Mac
                </Button>
              </div>
            </div>

            <div data-reveal className="reveal reveal-delay-2 flex flex-col items-center gap-4">
              <p className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('home_on_mobile')}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button
                  variant="primary"
                  size="auto"
                  className="h-auto rounded-full text-base py-2 px-6"
                >
                  <FaApple className="mr-2 mb-[2px]" /> iOS
                </Button>
                <Button
                  variant="primary"
                  size="auto"
                  className="h-auto rounded-full text-base py-2 px-6"
                >
                  <FaAndroid className="mr-2" /> Android
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-snap-section-auto z-10 mx-auto w-full max-w-7xl px-6 pt-0 md:px-16 md:pt-0 lg:px-32 lg:pt-0">
        <h2
          data-reveal
          className={`${sectionTitleClass} mb-16 text-center text-[3rem] sm:text-[3.5rem] md:mb-24 md:text-[4rem] lg:text-[5rem]`}
        >
          {t('home_why_title')}
        </h2>

        <div className="flex flex-col gap-14 pb-16 md:gap-20 md:pb-24 lg:pb-28">
          {whyItems.map((item, idx) => (
            <div
              key={idx}
              className={`why-block max-w-xl rounded-2xl border border-white/70 p-8 shadow-[0_18px_50px_rgba(11,11,10,0.06)] dark:border-white/10 text-center md:text-left ${
                item.align === 'right' ? 'md:ml-auto' : 'md:mr-auto'
              }`}
              style={{
                backgroundColor: isDarkMode ? 'rgba(18,20,19,0.86)' : 'rgba(255,255,255,0.88)',
                backgroundImage: isDarkMode
                  ? `radial-gradient(circle at ${item.gradientPosition}, ${item.color}14 0%, transparent 42%), linear-gradient(135deg, rgba(23,25,24,0.96) 0%, rgba(14,16,15,0.92) 100%)`
                  : `radial-gradient(circle at ${item.gradientPosition}, ${item.color}22 0%, transparent 45%), linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,245,0.9) 100%)`,
                backdropFilter: 'blur(10px)',
              }}
            >
              <h3 className="mb-4 text-2xl font-serif font-light md:font-normal leading-[1.08] tracking-[-0.03em] text-balance text-gray-900 dark:text-white md:text-3xl">
                {item.title}
              </h3>
              <p className="text-base leading-relaxed text-gray-600 dark:text-neutral-300 md:text-lg">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-feature-section relative z-10 bg-transparent px-6 pt-20 pb-28 md:px-16 md:pt-24 md:pb-32 lg:px-32 lg:pt-28 lg:pb-36">
        {/* Magnifier 2: Article Feed (Left side, top of the feature section) */}
        <div className="absolute top-[2%] md:top-[5%] left-0 -translate-x-[30%] sm:-translate-x-[20%] lg:-translate-x-[10%] w-[70vw] h-[70vw] max-w-[550px] max-h-[550px] min-w-[200px] min-h-[200px] opacity-15 dark:opacity-[0.08] blur-[4px] pointer-events-none z-0">
          <Magnifier className="w-full h-full transform scale-x-[-1] -rotate-[10deg]" />
        </div>
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-28 md:gap-32">
          {featureSections.map((feature, idx) => (
            <div
              key={feature.title}
              className={`flex flex-col items-center gap-12 ${feature.reverse ? 'md:flex-row-reverse' : 'md:flex-row'
                } lg:gap-20`}
            >
              <div className={`flex-1 space-y-6 text-center md:text-left ${feature.reverse ? 'md:pl-8 lg:pl-16' : ''}`}>
                <h2
                  data-reveal
                  className={`${featureTitleClass} text-3xl md:text-4xl lg:text-[2.75rem]`}
                  style={{ transitionDelay: `${idx * 20}ms` }}
                >
                  {feature.title}
                </h2>
                <p
                  data-reveal
                  className="reveal reveal-delay-1 text-lg leading-relaxed text-gray-500 dark:text-gray-400 md:text-xl"
                >
                  {feature.description}
                </p>
              </div>

              <div data-reveal className="reveal reveal-delay-2 group relative flex w-full flex-1 items-center justify-center">
                <div className={`absolute inset-0 rounded-3xl blur-2xl transition-colors duration-500 ${feature.glowClass}`}></div>
                <div className="home-showcase-card relative z-10 w-full transition-all duration-500 group-hover:translate-y-[-2px]">
                  <img src={feature.imageSrc} alt={feature.imageAlt} className="home-showcase-image aspect-[4/3] w-full object-cover object-center" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
