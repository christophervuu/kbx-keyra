import type { SchemaDetail, SchemaMetadata } from '@/lib/types';

const FIXTURE_TIMESTAMP = '2026-06-08T00:00:00.000Z';

const BASE_CDM_FIXTURES: readonly { metadata: SchemaMetadata; content: Readonly<Record<string, unknown>> | string }[] = [
  {
    metadata: {
      schemaId: 'cdm-shipment-order-xsd-v1',
      name: 'ShipmentOrder',
      format: 'xsd',
      dataFormat: 'xml',
      sourceKind: 'xsd',
      fieldCount: 1284,
      ownership: 'cdm',
      isCdm: true,
      readonly: true,
      origin: 'cdm',
      status: 'ready',
      description: 'System-provided CDM schema',
      inferred: false,
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: 'KBXT/KBX-Canonicals',
        branch: 'main',
        path: 'XSD/CommonDataModels/ShipmentOrder.xsd',
      },
      createdAt: FIXTURE_TIMESTAMP,
      updatedAt: FIXTURE_TIMESTAMP,
    },
    content: '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"></xsd:schema>',
  },
  {
    metadata: {
      schemaId: 'cdm-invoice-json-v1',
      name: 'Invoice',
      format: 'json-schema',
      dataFormat: 'json',
      sourceKind: 'json_schema',
      fieldCount: 412,
      ownership: 'cdm',
      isCdm: true,
      readonly: true,
      origin: 'cdm',
      status: 'ready',
      description: 'System-provided CDM schema',
      inferred: false,
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: 'KBXT/KBX-Canonicals',
        branch: 'main',
        path: 'JSONSchemas/CommonDataModels/Invoice.json',
      },
      createdAt: FIXTURE_TIMESTAMP,
      updatedAt: FIXTURE_TIMESTAMP,
    },
    content: {
      type: 'object',
      properties: {
        InvoiceNumber: { type: 'string' },
      },
    },
  },
];

export function listSeededCdmMetadataFixtures(): readonly SchemaMetadata[] {
  return BASE_CDM_FIXTURES.map((fixture) => fixture.metadata);
}

export function getSeededCdmSchemaDetail(schemaId: string): SchemaDetail | null {
  const match = BASE_CDM_FIXTURES.find((fixture) => fixture.metadata.schemaId === schemaId);
  if (!match) {
    return null;
  }

  return {
    metadata: match.metadata,
    content: match.content,
  };
}
