import { describe, expect, it } from 'vitest';

import { parseXsd } from '../../../../src/lib/schema/index.js';

describe('parseXsd', () => {
  it('parses simple XSD with expected paths and type mappings (AE-05)', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Order">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="DocumentType" type="xs:string" />
              <xs:element name="Quantity" type="xs:integer" />
              <xs:element name="IsActive" type="xs:boolean" />
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');

    expect(result.errors).toBeUndefined();
    expect(result.nodes.find((node) => node.path === 'Order')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'Order.DocumentType')?.type).toBe('string');
    expect(result.nodes.find((node) => node.path === 'Order.Quantity')?.type).toBe('number');
    expect(result.nodes.find((node) => node.path === 'Order.IsActive')?.type).toBe('boolean');
  });

  it('detects arrays from maxOccurs unbounded and >1', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Order">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Items" maxOccurs="unbounded">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="Sku" type="xs:string" />
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="Tags" type="xs:string" maxOccurs="3" />
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');

    expect(result.nodes.find((node) => node.path === 'Order.Items')?.isArray).toBe(true);
    expect(result.nodes.find((node) => node.path === 'Order.Tags')?.isArray).toBe(true);
  });

  it('models xs:choice alternatives as optional sibling nodes', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Payment">
          <xs:complexType>
            <xs:choice>
              <xs:element name="CardNumber" type="xs:string" />
              <xs:element name="BankAccount" type="xs:string" />
            </xs:choice>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');
    const card = result.nodes.find((node) => node.path === 'Payment.CardNumber');
    const bank = result.nodes.find((node) => node.path === 'Payment.BankAccount');

    expect(card).toBeDefined();
    expect(bank).toBeDefined();
    expect(card?.isRequired).toBe(false);
    expect(bank?.isRequired).toBe(false);
  });

  it('maps attributes to leaf nodes and supports xs:extension inheritance', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="BaseParty">
          <xs:sequence>
            <xs:element name="Id" type="xs:string" />
          </xs:sequence>
          <xs:attribute name="role" type="xs:string" use="required" />
        </xs:complexType>
        <xs:complexType name="BuyerType">
          <xs:complexContent>
            <xs:extension base="BaseParty">
              <xs:sequence>
                <xs:element name="CompanyName" type="xs:string" />
              </xs:sequence>
            </xs:extension>
          </xs:complexContent>
        </xs:complexType>
        <xs:element name="Buyer" type="BuyerType" />
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');

    expect(result.nodes.find((node) => node.path === 'Buyer.Id')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'Buyer.CompanyName')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'Buyer.role')?.isRequired).toBe(true);
  });

  it('maps primitive XSD types to expected normalized types', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Root">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="A" type="xs:int" />
              <xs:element name="B" type="xs:long" />
              <xs:element name="C" type="xs:short" />
              <xs:element name="D" type="xs:decimal" />
              <xs:element name="E" type="xs:float" />
              <xs:element name="F" type="xs:double" />
              <xs:element name="G" type="xs:date" />
              <xs:element name="H" type="xs:dateTime" />
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');
    expect(result.nodes.find((node) => node.path === 'Root.A')?.type).toBe('number');
    expect(result.nodes.find((node) => node.path === 'Root.F')?.type).toBe('number');
    expect(result.nodes.find((node) => node.path === 'Root.G')?.type).toBe('string');
    expect(result.nodes.find((node) => node.path === 'Root.H')?.type).toBe('string');
  });

  it('returns parse error result for invalid XML without throwing', () => {
    const result = parseXsd('<xs:schema><xs:element name="A"></xs:schema', 'schema-xsd');

    expect(result.nodes).toHaveLength(0);
    expect(result.fieldCount).toBe(0);
    expect(result.errors).toBeDefined();
  });

  it('populates parentPath, childCount, subtreeFieldCount, and embeddingText for all nodes', () => {
    const content = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Order">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Header">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="DocumentType" type="xs:string" />
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    const result = parseXsd(content, 'schema-xsd');
    const order = result.nodes.find((node) => node.path === 'Order');
    const header = result.nodes.find((node) => node.path === 'Order.Header');
    const docType = result.nodes.find((node) => node.path === 'Order.Header.DocumentType');

    expect(order?.childCount).toBe(1);
    expect(order?.subtreeFieldCount).toBe(1);
    expect(header?.parentPath).toBe('Order');
    expect(header?.childCount).toBe(1);
    expect(docType?.childCount).toBe(0);
    expect(docType?.subtreeFieldCount).toBe(1);
    for (const node of result.nodes) {
      expect(node.embeddingText.length).toBeGreaterThan(0);
      expect(Array.isArray(node.embedding)).toBe(true);
      expect(node.embedding?.length).toBeGreaterThan(0);
    }
  });
});
