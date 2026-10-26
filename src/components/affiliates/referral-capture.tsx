'use client';

import {useEffect, useRef} from 'react';

const MAX_REFERRAL_TOKEN_LENGTH = 255;

export function AffiliateReferralCapture() {
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    const touchReference = new URLSearchParams(window.location.search).get('fpr')?.trim();
    if (!touchReference || touchReference.length > MAX_REFERRAL_TOKEN_LENGTH || /[\x00-\x1f\x7f]/.test(touchReference)) return;
    submitted.current = true;
    void fetch('/api/affiliates/referral', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({touchReference}),
      cache: 'no-store',
    }).catch(() => {});
  }, []);

  return null;
}
