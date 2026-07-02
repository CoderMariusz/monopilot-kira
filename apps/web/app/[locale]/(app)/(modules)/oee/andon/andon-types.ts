export enum LineStatus {
  Running = 'running',
  Paused = 'paused',
  Idle = 'idle',
  Down = 'down',
}

export interface LineLiveStatus {
  id: string;
  lineCode: string;
  lineName: string;
  status: LineStatus;
  currentWONumber: string | null;
  currentProductName: string | null;
  goodKg: number;
  scrapKg: number;
  oeePercent: number | null;
  lastActivityAt: string | null;
}
