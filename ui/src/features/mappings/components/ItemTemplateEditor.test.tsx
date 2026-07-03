import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ItemTemplateEditor } from './ItemTemplateEditor';
import type { ItemTemplateState } from '../lib/array-builder-state';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

function createSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'lineItems.sku',
        fieldName: 'sku',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'lineItems',
        childCount: 0,
        children: [],
      },
    ],
    totalFieldCount: 1,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'lineItems',
    fieldName: 'lineItems',
    type: 'array',
    depth: 0,
    isArray: true,
    isRequired: false,
    parentPath: null,
    childCount: 1,
    children: [
      {
        path: 'lineItems.sku',
        fieldName: 'sku',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'lineItems',
        childCount: 0,
        children: [],
      },
    ],
  };
}

function createNestedSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'departments',
        fieldName: 'departments',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 1,
        children: [
          {
            path: 'departments.employees',
            fieldName: 'employees',
            type: 'array',
            depth: 1,
            isArray: true,
            isRequired: false,
            parentPath: 'departments',
            childCount: 1,
            children: [
              {
                path: 'departments.employees.employeeId',
                fieldName: 'employeeId',
                type: 'string',
                depth: 2,
                isArray: false,
                isRequired: false,
                parentPath: 'departments.employees',
                childCount: 0,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    totalFieldCount: 1,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createNestedSourceSchemaWithObjectChild(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'departments',
        fieldName: 'departments',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 1,
        children: [
          {
            path: 'departments.employees',
            fieldName: 'employees',
            type: 'array',
            depth: 1,
            isArray: true,
            isRequired: false,
            parentPath: 'departments',
            childCount: 2,
            children: [
              {
                path: 'departments.employees.employeeId',
                fieldName: 'employeeId',
                type: 'string',
                depth: 2,
                isArray: false,
                isRequired: false,
                parentPath: 'departments.employees',
                childCount: 0,
                children: [],
              },
              {
                path: 'departments.employees.lineItemApproval',
                fieldName: 'lineItemApproval',
                type: 'object',
                depth: 2,
                isArray: false,
                isRequired: false,
                parentPath: 'departments.employees',
                childCount: 1,
                children: [
                  {
                    path: 'departments.employees.lineItemApproval.status',
                    fieldName: 'status',
                    type: 'string',
                    depth: 3,
                    isArray: false,
                    isRequired: false,
                    parentPath: 'departments.employees.lineItemApproval',
                    childCount: 0,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    totalFieldCount: 2,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createNestedTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'divisions.staff',
    fieldName: 'staff',
    type: 'array',
    depth: 1,
    isArray: true,
    isRequired: false,
    parentPath: 'divisions',
    childCount: 1,
    children: [
      {
        path: 'divisions.staff.personId',
        fieldName: 'personId',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'divisions.staff',
        childCount: 0,
        children: [],
      },
    ],
  };
}

function createNestedSourceSchemaWithDepartmentName(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'departments',
        fieldName: 'departments',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 2,
        children: [
          {
            path: 'departments.name',
            fieldName: 'name',
            type: 'string',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'departments',
            childCount: 0,
            children: [],
          },
          {
            path: 'departments.employees',
            fieldName: 'employees',
            type: 'array',
            depth: 1,
            isArray: true,
            isRequired: false,
            parentPath: 'departments',
            childCount: 1,
            children: [
              {
                path: 'departments.employees.employeeId',
                fieldName: 'employeeId',
                type: 'string',
                depth: 2,
                isArray: false,
                isRequired: false,
                parentPath: 'departments.employees',
                childCount: 0,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    totalFieldCount: 2,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createObjectTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'divisions.staff',
    fieldName: 'staff',
    type: 'array',
    depth: 1,
    isArray: true,
    isRequired: false,
    parentPath: 'divisions',
    childCount: 1,
    children: [
      {
        path: 'divisions.staff.compensation',
        fieldName: 'compensation',
        type: 'object',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'divisions.staff',
        childCount: 2,
        children: [
          {
            path: 'divisions.staff.compensation.baseSalary',
            fieldName: 'baseSalary',
            type: 'number',
            depth: 3,
            isArray: false,
            isRequired: false,
            parentPath: 'divisions.staff.compensation',
            childCount: 0,
            children: [],
          },
          {
            path: 'divisions.staff.compensation.salaryBand',
            fieldName: 'salaryBand',
            type: 'string',
            depth: 3,
            isArray: false,
            isRequired: false,
            parentPath: 'divisions.staff.compensation',
            childCount: 0,
            children: [],
          },
        ],
      },
    ],
  };
}

describe('ItemTemplateEditor hydration fallback', () => {
  it('maps item fields when item template uses leaf-key targetFieldPath', () => {
    const itemTemplate: ItemTemplateState = {
      fields: [
        {
          kind: 'chain',
          targetFieldPath: 'sku',
          chainState: {
            source: { kind: 'field', path: '__item__:sku' },
            steps: [],
          },
        },
      ],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createTargetArrayNode()}
        parsedSourceSchema={createSourceSchema()}
        sourceArrayPath="lineItems"
        onFieldMappingChange={vi.fn()}
      />, 
    );

    expect(screen.getByTestId('item-template-mapped-count')).toHaveTextContent('1 / 1 mapped');
  });

  it('keeps nested item-field selections item-scoped when source array path is __item__ scoped', async () => {
    const user = userEvent.setup();
    const onFieldMappingChange = vi.fn();

    const itemTemplate: ItemTemplateState = {
      fields: [],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createNestedTargetArrayNode()}
        parsedSourceSchema={createNestedSourceSchema()}
        sourceArrayPath="__item__:employees"
        onFieldMappingChange={onFieldMappingChange}
      />,
    );

    await user.click(screen.getByTestId('item-field-toggle-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-search-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-option-divisions.staff.personId-item-employeeId'));

    expect(onFieldMappingChange).toHaveBeenLastCalledWith(
      'divisions.staff.personId',
      {
        kind: 'chain',
        targetFieldPath: 'divisions.staff.personId',
        chainState: {
          source: { kind: 'field', path: '__item__:employeeId' },
          steps: [],
        },
      },
    );
  });

  it('shows nested object child item fields in source options', async () => {
    const user = userEvent.setup();

    render(
      <ItemTemplateEditor
        itemTemplate={{ fields: [], nestedArrays: new Map() }}
        targetArrayNode={createNestedTargetArrayNode()}
        parsedSourceSchema={createNestedSourceSchemaWithObjectChild()}
        sourceArrayPath="__item__:employees"
        onFieldMappingChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('item-field-toggle-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-search-divisions.staff.personId'));

    expect(screen.getByTestId('field-option-divisions.staff.personId-item-lineItemApproval.status')).toBeInTheDocument();
  });

  it('renders object child fields inside expandable object groups', async () => {
    const user = userEvent.setup();
    const itemTemplate: ItemTemplateState = {
      fields: [],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createObjectTargetArrayNode()}
        parsedSourceSchema={createNestedSourceSchema()}
        sourceArrayPath="__item__:employees"
        onFieldMappingChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('object-group-divisions.staff.compensation')).toBeInTheDocument();
    expect(screen.queryByTestId('item-field-row-divisions.staff.compensation.baseSalary')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('object-group-toggle-divisions.staff.compensation'));

    expect(screen.getByTestId('item-field-row-divisions.staff.compensation.baseSalary')).toBeInTheDocument();
    expect(screen.getByTestId('item-field-row-divisions.staff.compensation.salaryBand')).toBeInTheDocument();
  });

  it('allows parent-scope mapping in nested context', async () => {
    const user = userEvent.setup();
    const onFieldMappingChange = vi.fn();

    const itemTemplate: ItemTemplateState = {
      fields: [],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createNestedTargetArrayNode()}
        parsedSourceSchema={createNestedSourceSchemaWithDepartmentName()}
        sourceArrayPath="__item__:employees"
        parentSourceArrayPath="departments"
        nestingDepth={1}
        onFieldMappingChange={onFieldMappingChange}
      />,
    );

    await user.click(screen.getByTestId('item-field-toggle-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-search-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-option-divisions.staff.personId-parent-name'));

    expect(onFieldMappingChange).toHaveBeenLastCalledWith(
      'divisions.staff.personId',
      {
        kind: 'chain',
        targetFieldPath: 'divisions.staff.personId',
        chainState: {
          source: { kind: 'field', path: '__parent__:name' },
          steps: [],
        },
      },
    );
  });

  it('uses provided itemContextFieldPaths for objectFields item recipe context', async () => {
    const user = userEvent.setup();
    const onFieldMappingChange = vi.fn();

    const itemTemplate: ItemTemplateState = {
      fields: [],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createNestedTargetArrayNode()}
        parsedSourceSchema={createNestedSourceSchemaWithDepartmentName()}
        sourceArrayPath=""
        itemContextFieldPaths={['day', 'value.BeginTime', 'value.IsOpen']}
        onFieldMappingChange={onFieldMappingChange}
      />,
    );

    await user.click(screen.getByTestId('item-field-toggle-divisions.staff.personId'));
    await user.click(screen.getByTestId('field-search-divisions.staff.personId'));

    expect(screen.getByTestId('field-option-divisions.staff.personId-item-day')).toBeInTheDocument();
    expect(screen.getByTestId('field-option-divisions.staff.personId-item-value.BeginTime')).toBeInTheDocument();
    expect(screen.getByTestId('field-option-divisions.staff.personId-item-value.IsOpen')).toBeInTheDocument();
    expect(screen.getByTestId('field-option-divisions.staff.personId-source-departments.name')).toBeInTheDocument();

    await user.click(screen.getByTestId('field-option-divisions.staff.personId-item-day'));
    expect(onFieldMappingChange).toHaveBeenLastCalledWith(
      'divisions.staff.personId',
      {
        kind: 'chain',
        targetFieldPath: 'divisions.staff.personId',
        chainState: {
          source: { kind: 'field', path: '__item__:day' },
          steps: [],
        },
      },
    );
  });
});
