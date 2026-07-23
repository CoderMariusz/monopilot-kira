/** Client-consumed MWO types (non-'use server' — safe to import from RSC + client islands). */

export type MwoLotoStatus = {
  requiresLoto: boolean;
  lockoutVerified: boolean;
  lockoutActive: boolean;
  releaseAllowed: boolean;
  releaseVerified: boolean;
};

export type MwoLotoVerifierOption = {
  id: string;
  name: string;
  email: string;
};
