'use server';

// Legacy import path kept for the PO detail screen. A bare `export { x } from`
// re-export is rejected by Turbopack in a 'use server' module (only async
// function declarations may be exported), so this must stay a real wrapper.
import { receivePoLineDesktop as receivePoLineDesktopImpl } from '../../../warehouse/_actions/receive-po-line';
import type { DesktopReceiveInput, DesktopReceiveResult } from './receive-po-line.types';

export async function receivePoLineDesktop(input: DesktopReceiveInput): Promise<DesktopReceiveResult> {
  return receivePoLineDesktopImpl(input);
}
