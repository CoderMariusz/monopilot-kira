export type D365Direction = 'incoming' | 'outgoing' | 'both';
export type D365Filter = 'all' | D365Direction;

export type D365FieldMapping = {
  d365_field: string;
  direction: D365Direction;
  monopilot_field: string;
  type: string;
  transform: string;
  unmapped?: boolean;
};

export type ExportD365MappingCsv = (input?: { dir?: D365Filter; rows?: D365FieldMapping[] }) => Response | Promise<Response>;

export type D365MappingPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ dir?: D365Filter }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  rows?: D365FieldMapping[];
  exportD365MappingCsv?: ExportD365MappingCsv;
  testD365Connection?: () => Promise<{ status: 'ok'; latencyMs: number; environment: string } | { status: 'error'; reason: string }>;
};

export type D365MappingLabels = {
  title: string;
  subtitle: string;
  exportCsv: string;
  testConnection: string;
  changeNotice: string;
  unmappedAlert: string;
  all: string;
  incoming: string;
  outgoing: string;
  directionFilterLabel: string;
  fieldLevelMap: string;
  d365Field: string;
  direction: string;
  monopilotField: string;
  type: string;
  transform: string;
  loading: string;
  empty: string;
  error: string;
  exportReady: string;
  exportFailed: string;
  testConnectionDialogTitle: string;
  testConnectionDialogBody: string;
  close: string;
};
