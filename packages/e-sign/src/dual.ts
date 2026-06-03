import { randomUUID } from 'node:crypto';

import { signEvent } from './sign.js';
import type { DualSignInput, ESignReceipt, ESignTxOptions } from './types.js';
import { ESignSoDError } from './types.js';

function sameSigner(primarySignerUserId: string, secondarySignerUserId: string): boolean {
  return primarySignerUserId.trim().toLowerCase() === secondarySignerUserId.trim().toLowerCase();
}

function requireClient(): never {
  throw new Error(
    'dual e-sign requires options.client with active app.current_org_id() context; call dualSign inside withOrgContext/runWithOrgContext',
  );
}

async function dualSignInClient(
  input: DualSignInput,
  client: NonNullable<ESignTxOptions['client']>,
  requestId?: string,
): Promise<{ primary: ESignReceipt; secondary: ESignReceipt }> {
  if (sameSigner(input.primarySignerUserId, input.secondarySignerUserId)) {
    throw new ESignSoDError();
  }

  const primary = await signEvent(
    {
      signerUserId: input.primarySignerUserId,
      pin: input.primaryPin,
      intent: input.intent,
      subject: input.subject,
      nonce: input.primaryNonce ?? randomUUID(),
      reason: input.reason,
    },
    { client, requestId },
  );

  const secondary = await signEvent(
    {
      signerUserId: input.secondarySignerUserId,
      pin: input.secondaryPin,
      intent: input.intent,
      subject: input.subject,
      nonce: input.secondaryNonce ?? randomUUID(),
      reason: input.reason,
    },
    { client, requestId },
  );

  return { primary, secondary };
}

export async function dualSign(
  input: DualSignInput,
  options: ESignTxOptions = {},
): Promise<{ primary: ESignReceipt; secondary: ESignReceipt }> {
  if (sameSigner(input.primarySignerUserId, input.secondarySignerUserId)) {
    throw new ESignSoDError();
  }

  if (options.client) {
    return dualSignInClient(input, options.client, options.requestId);
  }

  return requireClient();
}
