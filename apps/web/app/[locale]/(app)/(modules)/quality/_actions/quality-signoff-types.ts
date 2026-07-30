export type PendingQualitySignoff = {
  state: 'pending_second_signature';
  subjectHash: string;
  firstSignatureId: string;
  firstSignedAt: string;
  firstSigner: {
    id: string;
    displayName: string;
  };
  awaitingRole: {
    id: string;
    displayName: string;
  } | null;
};
