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
  const prefetchArticles = () => import('./Actuality');

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
      
      {/* Background Decor Removed as requested */}

      {/* BLOCK 1: Being informed — text left, images right */}
      <section className="home-snap-section px-6 md:px-16 lg:px-32 z-10 pt-24 pb-12">
        <div className="w-full flex flex-col md:flex-row items-center md:items-start gap-10 lg:gap-16">
          {/* Text */}
          <div className="flex-1 animate-fade-up flex flex-col items-start text-left mt-10">
            <h1 className="text-[3rem] sm:text-5xl md:text-[4rem] lg:text-[5rem] font-medium tracking-tight mb-6">
              Being informed <br className="hidden sm:block"/>
              has never been this easy
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg sm:text-xl max-w-lg leading-relaxed mb-6">
              on epion read and generate information with the community
            </p>
            <Link
              to="/actuality"
              onMouseEnter={prefetchArticles}
              className="inline-flex items-center justify-center bg-black text-white dark:bg-white dark:text-black font-semibold px-8 py-3 rounded-full text-lg whitespace-nowrap hover:scale-105 active:scale-95 transition-all outline-none shadow-md hover:shadow-lg"
            >
              read articles
            </Link>
          </div>
          {/* Images — stacked / overlapping */}
          <div className="flex-shrink-0 w-full md:w-[40%] lg:w-[38%] relative h-72 md:h-96 animate-fade-up delay-200">
            <img src="/img/IMG4.png" alt="Feed Epion" className="absolute top-0 right-0 w-[70%] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 object-cover" />
            <img src="/img/IMG1.png" alt="Article content" className="absolute top-16 right-16 w-[55%] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 object-cover" />
          </div>
        </div>
      </section>

      {/* BLOCK 2: Forget traditionals — text left, images right */}
      <section className="px-6 md:px-16 lg:px-32 z-10 pt-12 pb-24">
        <div className="w-full flex flex-col md:flex-row items-center md:items-start gap-10 lg:gap-16">
          {/* Text */}
          <div className="flex-1 animate-fade-up delay-100 flex flex-col items-start text-left">
            <h2 className="text-[3rem] sm:text-4xl md:text-[4rem] lg:text-[5rem] font-medium tracking-tight mb-6">
              Forget traditionals <br className="hidden sm:block"/>
              ai chat
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg sm:text-xl max-w-lg leading-relaxed mb-6">
              on epion access to reliable fact check and deep analysis on every subject.
            </p>
            <Link
              to="/chat"
              onMouseEnter={prefetchChat}
              className="inline-flex items-center justify-center bg-black text-white dark:bg-white dark:text-black font-semibold px-8 py-3 rounded-full text-lg whitespace-nowrap hover:scale-105 active:scale-95 transition-all outline-none shadow-md hover:shadow-lg"
            >
              open ai chat
            </Link>

            {/* BLOCK 2b: Everywhere anytime + download buttons (Moved inside left column) */}
            <div className="mt-20 md:mt-32">
               <h2 className="text-[2.5rem] sm:text-4xl md:text-[3.5rem] lg:text-[4.5rem] font-medium tracking-tight mb-10">
                 and access to epion <br className="hidden sm:block"/> everywhere anytime.
               </h2>
               <div className="flex flex-col gap-8">
                 <div className="flex flex-col items-start gap-4">
                   <p className="text-gray-500 dark:text-gray-400 font-medium text-sm tracking-wide uppercase">on desktop</p>
                   <div className="flex flex-wrap gap-4">
                      <Button variant="outline" className="rounded-full px-5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                         <FaWindows className="mr-2" /> Windows
                      </Button>
                      <Button variant="outline" className="rounded-full px-5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors border-gray-300 dark:border-gray-700">
                         <FaApple className="mr-2 mb-[2px]" /> Mac
                      </Button>
                   </div>
                 </div>
                 <div className="flex flex-col items-start gap-4 mt-2">
                   <p className="text-gray-500 dark:text-gray-400 font-medium text-sm tracking-wide uppercase">on mobile</p>
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
          <div className="flex-shrink-0 w-full md:w-[45%] lg:w-[40%] relative min-h-[350px] md:min-h-[500px] animate-fade-up delay-300 mt-12 md:mt-0">
            <img src="/img/IMG1.png" alt="AI Summary" className="absolute top-0 right-4 w-[65%] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 object-cover" />
            <img src="/img/IMG6.png" alt="AI Generation Context" className="absolute top-24 md:top-32 right-[-10px] md:right-[-20px] w-[70%] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 object-cover" />
          </div>
        </div>
      </section>

      {/* BLOCK 3: Why epion? */}
      <section ref={whySectionRef} className="home-snap-section-auto px-6 md:px-16 lg:px-32 z-10 max-w-7xl mx-auto w-full">
         
         {/* Title on top */}
         <h2 className="text-[3.5rem] md:text-[4rem] lg:text-[5rem] font-medium tracking-tight text-center mb-16 md:mb-24">
           Why epion?
         </h2>

         {/* Alternating blocks */}
         <div className="flex flex-col gap-16 md:gap-24 pb-32">
           {[
             {
               num: "1.",
               title: 'Reclaim Your Trust in News',
               text: 'Information floods in from every side—fast, messy, and often misleading. Epion cuts through the noise, giving you clear, vetted insights you can rely on.',
               color: 'text-blue-500',
               align: 'left'
             },
             {
               num: "2.",
               title: 'Your Dynamic, AI-Driven Newsroom',
               text: 'More than a reader and more than a chatbot. Epion combines editorial precision with on-demand AI, so you control how deep you go—whether it\u2019s a quick overview or an in-depth breakdown.',
               color: 'text-teal-500',
               align: 'right'
             },
             {
               num: "3.",
               title: 'Instant Verification, Zero Spin',
               text: 'See something questionable? A headline, a quote, a claim? One click in Epion and our AI cross-checks top sources, delivering a direct answer—no agendas, just clarity.',
               color: 'text-orange-500',
               align: 'left'
             },
             {
               num: "4.",
               title: 'Insights That Spark Conversation',
               text: 'Read a story. Unpack complex topics. Share your perspective. Epion equips you with contextual background, key data points, and a space to discuss what truly matters.',
               color: 'text-purple-500',
               align: 'right'
             },
             {
               num: "5.",
               title: 'Check. Learn. Talk.',
               text: 'Fast verification. Smarter understanding. Meaningful dialogue. Epion: where information meets intelligence.',
               color: 'text-rose-500',
               align: 'left'
             }
           ].map((item, idx) => (
             <div
               key={idx}
               className={`why-block max-w-xl p-8 rounded-2xl bg-white/60 dark:bg-white/5 border border-gray-100 dark:border-gray-800 shadow-sm ${
                 item.align === 'right' ? 'md:ml-auto' : 'md:mr-auto'
               }`}
             >
               <h3 className="mb-4 text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
                 <span className={`${item.color} mr-3 font-normal text-xl opacity-80`}>{item.num}</span>
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
                Feed d'articles
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                Découverte de l'actualité fact-checkée, consultation d'articles variés et partage avec la communauté. Retrouvez l'essentiel en un clin d'œil.
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
                Création d'articles
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                Génération via un simple prompt pour soi ou pour publication. Devenez acteur de l'information avec l'aide d'Epion.
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
                Chat IA
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                Mode conversation et investigation dynamique avec l'IA. Posez vos questions, exigez des sources et comprenez les sujets en profondeur.
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
                Transparence Absolue
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl leading-relaxed">
                Explication du score global, des vérifications factuelles de l'IA et de l'accès garanti aux sources. Le cœur Epion 2.0 au service de l'intégrité.
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
