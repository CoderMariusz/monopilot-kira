import type { CompanyHeader } from './types';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrganizationRow = {
  name: string;
  legal_name: string | null;
  vat: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildAddressLines(row: OrganizationRow): string[] {
  const lines: string[] = [];
  const street = trimOrNull(row.street);
  const cityLine = [trimOrNull(row.zip), trimOrNull(row.city)].filter(Boolean).join(' ');
  const country = trimOrNull(row.country);
  if (street) lines.push(street);
  if (cityLine) lines.push(cityLine);
  if (country) lines.push(country);
  return lines;
}

export function mapOrganizationRowToCompanyHeader(row: OrganizationRow): CompanyHeader {
  return {
    tradingName: row.name.trim(),
    legalName: trimOrNull(row.legal_name),
    vat: trimOrNull(row.vat),
    addressLines: buildAddressLines(row),
    email: trimOrNull(row.email),
    phone: trimOrNull(row.phone),
  };
}

/** Org-scoped letterhead for printable documents (settings company profile). */
export async function fetchCompanyHeader(client: QueryClient): Promise<CompanyHeader | null> {
  const { rows } = await client.query<OrganizationRow>(
    `select name,
            legal_name,
            vat,
            street,
            city,
            zip,
            country,
            email,
            phone
       from public.organizations
      where id = app.current_org_id()
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return mapOrganizationRowToCompanyHeader(row);
}
