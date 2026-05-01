import { describe, expect, it } from 'vitest';

import { parseXsd, SchemaParseError } from '@/features/schemas';

describe('parseXsd', () => {
  describe('AE-02: Person complex type with required fields and array', () => {
    const xsd = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Person">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="firstName" type="xs:string" minOccurs="1"/>
        <xs:element name="lastName" type="xs:string" minOccurs="1"/>
        <xs:element name="phones" type="xs:string" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

    it('produces a root Person node', () => {
      const result = parseXsd(xsd);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].fieldName).toBe('Person');
      expect(result.nodes[0].type).toBe('object');
    });

    it('has 3 children under Person', () => {
      const result = parseXsd(xsd);
      const person = result.nodes[0];
      expect(person.children).toHaveLength(3);
      expect(person.childCount).toBe(3);
    });

    it('marks firstName and lastName as required (minOccurs=1)', () => {
      const result = parseXsd(xsd);
      const children = result.nodes[0].children;
      expect(children[0].fieldName).toBe('firstName');
      expect(children[0].isRequired).toBe(true);
      expect(children[1].fieldName).toBe('lastName');
      expect(children[1].isRequired).toBe(true);
    });

    it('maps firstName and lastName to string type', () => {
      const result = parseXsd(xsd);
      const children = result.nodes[0].children;
      expect(children[0].type).toBe('string');
      expect(children[1].type).toBe('string');
    });

    it('marks phones as array (maxOccurs=unbounded)', () => {
      const result = parseXsd(xsd);
      const phones = result.nodes[0].children[2];
      expect(phones.fieldName).toBe('phones');
      expect(phones.isArray).toBe(true);
      expect(phones.maxOccurs).toBe('unbounded');
    });

    it('sets correct paths', () => {
      const result = parseXsd(xsd);
      const children = result.nodes[0].children;
      expect(children[0].path).toBe('Person.firstName');
      expect(children[1].path).toBe('Person.lastName');
      expect(children[2].path).toBe('Person.phones');
    });

    it('sets correct depth values', () => {
      const result = parseXsd(xsd);
      expect(result.nodes[0].depth).toBe(0);
      expect(result.nodes[0].children[0].depth).toBe(1);
    });

    it('sets parentPath correctly', () => {
      const result = parseXsd(xsd);
      expect(result.nodes[0].parentPath).toBeNull();
      expect(result.nodes[0].children[0].parentPath).toBe('Person');
    });

    it('sets format to xsd', () => {
      const result = parseXsd(xsd);
      expect(result.format).toBe('xsd');
    });

    it('sets inferred to false', () => {
      const result = parseXsd(xsd);
      expect(result.inferred).toBe(false);
    });

    it('records parseTimeMs', () => {
      const result = parseXsd(xsd);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Type mapping', () => {
    function makeXsd(type: string): string {
      return `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="field" type="${type}"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
    }

    it('maps xs:string to string', () => {
      const result = parseXsd(makeXsd('xs:string'));
      expect(result.nodes[0].children[0].type).toBe('string');
    });

    it('maps xs:integer to number', () => {
      const result = parseXsd(makeXsd('xs:integer'));
      expect(result.nodes[0].children[0].type).toBe('number');
    });

    it('maps xs:int to number', () => {
      const result = parseXsd(makeXsd('xs:int'));
      expect(result.nodes[0].children[0].type).toBe('number');
    });

    it('maps xs:decimal to number', () => {
      const result = parseXsd(makeXsd('xs:decimal'));
      expect(result.nodes[0].children[0].type).toBe('number');
    });

    it('maps xs:float to number', () => {
      const result = parseXsd(makeXsd('xs:float'));
      expect(result.nodes[0].children[0].type).toBe('number');
    });

    it('maps xs:double to number', () => {
      const result = parseXsd(makeXsd('xs:double'));
      expect(result.nodes[0].children[0].type).toBe('number');
    });

    it('maps xs:boolean to boolean', () => {
      const result = parseXsd(makeXsd('xs:boolean'));
      expect(result.nodes[0].children[0].type).toBe('boolean');
    });

    it('maps xs:date to string', () => {
      const result = parseXsd(makeXsd('xs:date'));
      expect(result.nodes[0].children[0].type).toBe('string');
    });

    it('maps xs:dateTime to string', () => {
      const result = parseXsd(makeXsd('xs:dateTime'));
      expect(result.nodes[0].children[0].type).toBe('string');
    });

    it('maps xs:anyType to any', () => {
      const result = parseXsd(makeXsd('xs:anyType'));
      expect(result.nodes[0].children[0].type).toBe('any');
    });

    it('maps unknown types to any', () => {
      const result = parseXsd(makeXsd('xs:unknownType'));
      expect(result.nodes[0].children[0].type).toBe('any');
    });
  });

  describe('Cardinality', () => {
    it('defaults minOccurs to 1 (required by default)', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="field" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].children[0].isRequired).toBe(true);
    });

    it('minOccurs=0 means not required', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="field" type="xs:string" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].children[0].isRequired).toBe(false);
    });

    it('maxOccurs > 1 means isArray', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="items" type="xs:string" maxOccurs="5"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].children[0].isArray).toBe(true);
      expect(result.nodes[0].children[0].maxOccurs).toBe(5);
    });

    it('stores minOccurs and maxOccurs values on nodes', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="field" type="xs:string" minOccurs="2" maxOccurs="10"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      const field = result.nodes[0].children[0];
      expect(field.minOccurs).toBe(2);
      expect(field.maxOccurs).toBe(10);
    });
  });

  describe('Annotations', () => {
    it('extracts xs:documentation as description', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string">
          <xs:annotation>
            <xs:documentation>The user's full name</xs:documentation>
          </xs:annotation>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].children[0].description).toBe("The user's full name");
    });

    it('returns undefined description when no annotation present', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="field" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].children[0].description).toBeUndefined();
    });
  });

  describe('xs:attribute handling', () => {
    it('renders attributes as child nodes', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="item">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="value" type="xs:string"/>
      </xs:sequence>
      <xs:attribute name="id" type="xs:integer"/>
      <xs:attribute name="lang" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      const item = result.nodes[0];
      // Should have value element + 2 attributes = 3 children
      expect(item.children).toHaveLength(3);

      const idAttr = item.children.find((c) => c.fieldName === 'id');
      expect(idAttr).toBeDefined();
      expect(idAttr!.type).toBe('number');
      expect(idAttr!.isRequired).toBe(false);

      const langAttr = item.children.find((c) => c.fieldName === 'lang');
      expect(langAttr).toBeDefined();
      expect(langAttr!.type).toBe('string');
      expect(langAttr!.isRequired).toBe(true);
    });

    it('marks attributes with @attribute description', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="item">
    <xs:complexType>
      <xs:attribute name="id" type="xs:string"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      const attr = result.nodes[0].children.find((c) => c.fieldName === 'id');
      expect(attr!.description).toBe('@attribute');
    });
  });

  describe('xs:choice (union type)', () => {
    it('sets type to union for element with xs:choice', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="payment">
    <xs:complexType>
      <xs:choice>
        <xs:element name="card" type="xs:string"/>
        <xs:element name="cash" type="xs:boolean"/>
        <xs:element name="transfer" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].type).toBe('union');
    });

    it('extracts member types from choice into unionTypes', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="payment">
    <xs:complexType>
      <xs:choice>
        <xs:element name="card" type="xs:string"/>
        <xs:element name="cash" type="xs:boolean"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].unionTypes).toEqual(['string', 'boolean']);
    });
  });

  describe('xs:enumeration', () => {
    it('detects enum from simpleType with restrictions', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="status">
          <xs:simpleType>
            <xs:restriction base="xs:string">
              <xs:enumeration value="active"/>
              <xs:enumeration value="inactive"/>
              <xs:enumeration value="pending"/>
            </xs:restriction>
          </xs:simpleType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      const status = result.nodes[0].children[0];
      expect(status.type).toBe('enum');
      expect(status.enumValues).toEqual(['active', 'inactive', 'pending']);
    });
  });

  describe('Nested complex types', () => {
    it('handles multi-level nesting', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="order">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="customer">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string"/>
              <xs:element name="address">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="city" type="xs:string"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes[0].fieldName).toBe('order');
      expect(result.nodes[0].depth).toBe(0);

      const customer = result.nodes[0].children[0];
      expect(customer.fieldName).toBe('customer');
      expect(customer.type).toBe('object');
      expect(customer.depth).toBe(1);
      expect(customer.path).toBe('order.customer');

      const address = customer.children[1];
      expect(address.fieldName).toBe('address');
      expect(address.type).toBe('object');
      expect(address.depth).toBe(2);
      expect(address.path).toBe('order.customer.address');

      const city = address.children[0];
      expect(city.fieldName).toBe('city');
      expect(city.type).toBe('string');
      expect(city.depth).toBe(3);
      expect(city.path).toBe('order.customer.address.city');
    });

    it('counts total fields correctly for nested types', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="a" type="xs:string"/>
        <xs:element name="b">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="c" type="xs:string"/>
              <xs:element name="d" type="xs:string"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
      const result = parseXsd(xsd);
      // root + a + b + c + d = 5
      expect(result.totalFieldCount).toBe(5);
    });
  });

  describe('AE-08: Error handling', () => {
    it('throws SchemaParseError for invalid XML', () => {
      expect(() => parseXsd('<not valid xml')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for empty content', () => {
      expect(() => parseXsd('')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for non-XSD XML', () => {
      const xml = '<?xml version="1.0"?><html><body>Hello</body></html>';
      expect(() => parseXsd(xml)).toThrow(SchemaParseError);
      expect(() => parseXsd(xml)).toThrow('root element must be xs:schema');
    });

    it('includes error details in SchemaParseError', () => {
      try {
        parseXsd('<not valid');
      } catch (err) {
        expect(err).toBeInstanceOf(SchemaParseError);
        expect((err as SchemaParseError).format).toBe('xsd');
      }
    });
  });

  describe('Empty schema', () => {
    it('returns empty nodes for schema with no elements', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes).toHaveLength(0);
      expect(result.totalFieldCount).toBe(0);
    });
  });

  describe('Multiple top-level elements', () => {
    it('handles multiple root elements', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Customer" type="xs:string"/>
  <xs:element name="Order" type="xs:string"/>
  <xs:element name="Product" type="xs:string"/>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes).toHaveLength(3);
      expect(result.nodes[0].fieldName).toBe('Customer');
      expect(result.nodes[1].fieldName).toBe('Order');
      expect(result.nodes[2].fieldName).toBe('Product');
    });
  });
});
