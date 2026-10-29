'use client';

import {useEffect, useRef} from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Readonly<{
        sitekey: string;
        action: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
        'error-callback': () => void;
      }>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({siteKey, action, onToken}: Readonly<{siteKey: string; action: string; onToken: (token: string) => void}>) {
  const element = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {onTokenRef.current = onToken;}, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let disposed = false;
    const render = () => {
      if (disposed || widgetId || !element.current || !window.turnstile) return;
      widgetId = window.turnstile.render(element.current, {
        sitekey: siteKey,
        action,
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile="true"]');
    if (window.turnstile) render();
    else if (existing) existing.addEventListener('load', render);
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = 'true';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      existing?.removeEventListener('load', render);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [action, siteKey]);

  return <div ref={element} aria-label="Security check" />;
}
