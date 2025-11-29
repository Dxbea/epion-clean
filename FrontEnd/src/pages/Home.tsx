import React, { JSX } from 'react';
import { H1, H2, H3, Body, Lead, Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

const Section: React.FC<React.PropsWithChildren<{ id?: string; className?: string }>> = ({ id, className = '', children }) => (
  <section id={id} className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</section>
);

export default function Home(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="min-h-screen space-y-16 sm:space-y-24">
      {/* HERO (centered) */}
      <Section className="pt-10 pb-12 sm:pt-16 sm:pb-20 text-center">
        <div className="mx-auto max-w-3xl">
          <H1>{t('home_title').split('\n').map((line, i) => (<span key={i}>{line}{i===0 && <br/>}</span>))}</H1>
          <Lead className="mt-4">{t('home_lead')}</Lead>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:max-w-md mx-auto">
            <Button as="a" href="/chat" variant="primary">{t('cta_chat')}</Button>
            <Button as="a" href="/actuality" variant="ghost">{t('cta_articles')}</Button>
          </div>
        </div>
      </Section>
      

      {/* WHY EPION — zigzag (quinconce) */}
      <Section id="why">
        <H2 className="text-left">WHY EPION?</H2>
        <div className="mt-8">
          {[
            {
              title: '1. Reclaim Your Trust in News',
              text: 'Information floods in from every side—fast, messy, and often misleading. Epion cuts through the noise, giving you clear, vetted insights you can rely on.'
            },
            {
              title: '2. Your Dynamic, AI-Driven Newsroom',
              text: 'More than a reader and more than a chatbot. Epion combines editorial precision with on-demand AI, so you control how deep you go—whether it’s a quick overview or an in-depth breakdown.'
            },
            {
              title: '3. Instant Verification, Zero Spin',
              text: 'See something questionable? A headline, a quote, a claim? One click in Epion and our AI cross-checks top sources, delivering a direct answer—no agendas, just clarity.'
            },
            {
              title: '4. Insights that spark conversation',
              text: 'Read a story. Unpack complex topics. Share your perspective. Epion equips you with contextual background, key data points, and a space to discuss what truly matters.'
            },
            {
              title: '5. Check. Learn. Talk.',
              text: 'Fast verification -- Smarter understanding -- Meaningful dialogue. Epion: where information meets intelligence.'
            }
          ].map((item, idx) => (
            <div key={idx} className={`relative mb-10 w-full lg:w-1/2 ${idx % 2 === 1 ? 'lg:ml-auto' : ''}`}>
              <H3 as="p" className="mb-2">
                <span className="mr-2 text-brand-lightBlue">{item.title.split('.')[0]}.</span>
                {item.title.split('.').slice(1).join('.').trim()}
              </H3>
              <Body>{item.text}</Body>
            </div>
          ))}
        </div>
      </Section>

      {/* EXAMPLE — full text with glass answer */}
      <Section id="example" className="pb-16">
        <div className="mb-6 flex items-center justify-center gap-4">
          <H3 as="div" className="text-center">Example of a conversation with Epion</H3>
          <div className="hidden sm:block w-[30vw] h-[2px] bg-[#4290D3] rounded-md" />
        </div>
        <div className="mx-auto max-w-[90%] md:max-w-[80%]">
          <div className="rounded-xl bg-black p-4 sm:p-6 md:p-8 text-brand-white shadow-soft">
            {/* Question */}
            <div className="mb-6 ml-[20%] sm:ml-[30%] md:ml-[40%] max-w-[90%] sm:max-w-[80%] md:max-w-[60%] rounded-lg bg-brand-indigo px-4 py-3 text-sm sm:text-base md:text-sm">
              J'ai entendu dire que Mistral AI pourrait être racheté notamment par Apple. Est-ce vrai ?
            </div>
            {/* Answer (glass) */}
            <div className="glass rounded-xl p-4 sm:p-6 md:p-8 text-neutral-100">
              <h4 className="text-base sm:text-lg md:text-base font-semibold">1. Rumeurs et spéculations</h4>
              <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base md:text-sm">
                <li>Des analystes comme Mark Gurman de Bloomberg rapportent qu’Apple envisagerait sérieusement l’acquisition de Mistral AI, probablement pour renforcer ses capacités en IA, notamment autour de Siri.</li>
                <li>Certains sites tech (BlogNT, Siècle Digital) reprennent ces informations en mentionnant une valorisation d’environ 5,8 milliards d’euros (~6Md $) de Mistral et un rachat potentiel à ce niveau.</li>
              </ul>
              <p className="mt-2 text-sm sm:text-base md:text-sm">Donc oui, l’idée d’un rachat est évoquée dans les médias, mais rien n’est confirmé officiellement.</p>

              <h4 className="mt-4 text-base sm:text-lg md:text-base font-semibold">2. La position officielle de Mistral</h4>
              <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base md:text-sm">
                <li>Un porte-parole de Mistral a clairement indiqué : « nous sommes indépendants et souhaitons le rester ». Des éléments indiquent que Mistral n’est pas intéressée par une vente, préférant maintenir son autonomie et sa stratégie européenne.</li>
              </ul>

              <h4 className="mt-4 text-base sm:text-lg md:text-base font-semibold">3. Freins géopolitiques et réglementaires</h4>
              <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base md:text-sm">
                <li>Une acquisition par un acteur non-européen comme Apple susciterait une forte opposition en Europe, notamment à cause des enjeux de souveraineté numérique et stratégique. Cela rendrait très difficile l’aboutissement d’un accord aux niveaux réglementaires, même si l’offre financière était élevée.</li>
              </ul>

              <h4 className="mt-4 text-base sm:text-lg md:text-base font-semibold">4. Évaluation du scénario probable</h4>
              <ul className="list-disc pl-6 space-y-1 text-sm sm:text-base md:text-sm">
                <li><strong>Intérêt d’Apple :</strong> Moyen à élevé (besoin d’IA et retard historique)</li>
                <li><strong>Volonté de Mistral :</strong> Nulle à faible (déclaration d’indépendance)</li>
                <li><strong>Obstacle réglementaire :</strong> Très élevé (souveraineté européenne)</li>
                <li><strong>Confirmation officielle :</strong> Aucune à ce jour</li>
              </ul>

              <h4 className="mt-4 text-base sm:text-lg md:text-base font-semibold">Conclusion Epion</h4>
              <p className="text-sm sm:text-base md:text-sm">Il est faux de dire que l’acquisition a eu lieu — c’est pour l’instant une rumeur, pas un fait. Des personnalités du secteur évoquent l’intérêt d’Apple, mais Mistral dément formellement tout désir de vendre. Les chances de voir un tel rachat se réaliser sont minces à cause des blocages politiques et juridiques en Europe. En l’état, nous n’avons aucune preuve concrète, seulement des spéculations et des communiqués de refus.</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
