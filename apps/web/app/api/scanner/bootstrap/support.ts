import { jsonError, jsonOk } from '../../../../lib/scanner/route-utils';
import { toPublicScannerSession } from '../../../../lib/scanner/session';

import type { ScannerSessionRow } from '../../../../lib/scanner/session';

export { jsonError, jsonOk };

export function toPublicScannerSessionBody(session: ScannerSessionRow) {
  const publicSession = toPublicScannerSession(session);
  return {
    id: publicSession.id,
    userId: publicSession.userId,
    deviceId: publicSession.deviceId,
    siteId: publicSession.siteId,
    lineId: publicSession.lineId,
    shift: publicSession.shift,
    mode: publicSession.mode,
    expiresAt: publicSession.expiresAt,
  };
}
