import {toNextJsHandler} from 'better-auth/next-js';

import {auth} from '../../../../lib/auth.ts';

// Keep initialization lazy while giving the adapter an actual callable. The
// proxy has no own handler property, so the adapter's `in` check is unsuitable.
const handler = toNextJsHandler((request: Request) => auth.handler(request));

export const GET = handler.GET;
export const POST = handler.POST;

