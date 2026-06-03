import { describe, expect, it } from 'vitest';

import { parseSamlIssuer } from '../issuer-parser.js';

const legacyIssuerRegex = (xml: string): string | undefined =>
  xml.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/)?.[1]?.trim();

describe('parseSamlIssuer', () => {
  it('extracts Issuer with the legacy saml namespace prefix', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
      <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    </samlp:Response>`;

    expect(parseSamlIssuer(xml)).toBe('https://idp.example.com/metadata');
  });

  it('extracts Issuer when the SAML assertion namespace uses a different prefix', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
      <saml2:Issuer>https://idp-alt-prefix.example.com/metadata</saml2:Issuer>
    </samlp:Response>`;

    expect(parseSamlIssuer(xml)).toBe(
      'https://idp-alt-prefix.example.com/metadata',
    );
  });

  it('extracts CDATA Issuer text without CDATA markers', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
      <saml2:Issuer><![CDATA[
        https://idp-cdata.example.com/metadata
      ]]></saml2:Issuer>
    </samlp:Response>`;

    expect(parseSamlIssuer(xml)).toBe('https://idp-cdata.example.com/metadata');
  });

  it('throws issuer_missing for malformed XML instead of partially matching text', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
      <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>`;

    expect(() => parseSamlIssuer(xml)).toThrow('issuer_missing');
  });

  it('throws issuer_missing when Issuer is absent', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
      <saml:Subject>alice@example.com</saml:Subject>
    </samlp:Response>`;

    expect(() => parseSamlIssuer(xml)).toThrow('issuer_missing');
  });

  it('matches legacy regex output for T-012 happy-path assertions', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="_test-response" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
      <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
      <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
      <saml:Assertion>
        <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
      </saml:Assertion>
    </samlp:Response>`;

    expect(parseSamlIssuer(xml)).toBe(legacyIssuerRegex(xml));
  });
});
