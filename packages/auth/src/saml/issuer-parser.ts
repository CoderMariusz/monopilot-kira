import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';

const SAML_ASSERTION_NS = 'urn:oasis:names:tc:SAML:2.0:assertion';
const selectSaml = xpath.useNamespaces({
  saml: SAML_ASSERTION_NS,
});

function issuerMissing(): Error {
  return new Error('issuer_missing');
}

export function parseSamlIssuer(assertionXml: string): string {
  const parseErrors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: (message) => parseErrors.push(message),
      error: (message) => parseErrors.push(message),
      fatalError: (message) => parseErrors.push(message),
    },
  }).parseFromString(assertionXml, 'application/xml');

  if (parseErrors.length > 0) {
    throw issuerMissing();
  }

  const nodes = selectSaml('//saml:Issuer[1]', document);
  const issuerNode = Array.isArray(nodes) ? nodes[0] : undefined;
  const issuer =
    issuerNode && 'textContent' in issuerNode
      ? issuerNode.textContent?.trim()
      : undefined;

  if (!issuer) {
    throw issuerMissing();
  }

  return issuer;
}
