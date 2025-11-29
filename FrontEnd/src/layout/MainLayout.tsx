import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';


import Header from '@/components/Header';
import Footer from '@/components/Footer';
import logoLight from '@/assets/LG_All_Blanc.png';
import logoDark from '@/assets/LG_Text_Noir.png';
import { ToasterProvider } from '@/components/ui/Toast';
import { AuthPromptProvider } from '@/contexts/AuthPromptContext';


function useExposeChromeHeights(): void {
const { pathname } = useLocation();


React.useEffect(() => {
const root = document.documentElement;


const setVars = () => {
const headerEl = document.querySelector<HTMLElement>('[data-app-header]');
const footerEl = document.querySelector<HTMLElement>('[data-app-footer]');
const h = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 64;
const f = footerEl ? Math.round(footerEl.getBoundingClientRect().height) : 0;
root.style.setProperty('--app-header-h', `${h}px`);
root.style.setProperty('--app-footer-h', `${f}px`);
};


setVars();


const ro = new ResizeObserver(() => setVars());
const headerEl = document.querySelector<HTMLElement>('[data-app-header]');
const footerEl = document.querySelector<HTMLElement>('[data-app-footer]');
if (headerEl) ro.observe(headerEl);
if (footerEl) ro.observe(footerEl);


window.addEventListener('resize', setVars);


return () => {
ro.disconnect();
window.removeEventListener('resize', setVars);
};
}, [pathname]);
}

export default function MainLayout(): React.JSX.Element {
  const { pathname } = useLocation();
React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);


useExposeChromeHeights();


return (
  <AuthPromptProvider>
<ToasterProvider>
<div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-[#FAFAF5] text-neutral-900 dark:bg-neutral-950 dark:text-white">
<Header data-app-header />
<main className="min-h-0">
<Outlet />
</main>
<Footer
  data-app-footer
  logoLight={logoLight}
  logoDark={logoDark}
/>
</div>
</ToasterProvider>
</AuthPromptProvider>
);
}