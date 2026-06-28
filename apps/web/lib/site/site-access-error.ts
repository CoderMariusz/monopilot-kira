export class SiteAccessError extends Error {
  readonly siteId: string;

  constructor(siteId: string) {
    super(`User is not assigned to site ${siteId}`);
    this.name = 'SiteAccessError';
    this.siteId = siteId;
  }
}
