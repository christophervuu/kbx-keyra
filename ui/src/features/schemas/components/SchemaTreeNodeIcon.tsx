import {
  Braces,
  Circle,
  FileText,
  GitMerge,
  Hash,
  List,
  ListOrdered,
  ToggleLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { SchemaNodeType } from '@/lib/types';

const ICON_MAP: Record<SchemaNodeType, LucideIcon> = {
  string: FileText,
  number: Hash,
  boolean: ToggleLeft,
  object: Braces,
  array: List,
  enum: ListOrdered,
  null: Circle,
  any: Circle,
  union: GitMerge,
};

const COLOR_MAP: Record<SchemaNodeType, string> = {
  string: 'text-green-400',
  number: 'text-blue-400',
  boolean: 'text-amber-400',
  object: 'text-purple-400',
  array: 'text-cyan-400',
  enum: 'text-orange-400',
  null: 'text-slate-500',
  any: 'text-slate-500',
  union: 'text-pink-400',
};

interface SchemaTreeNodeIconProps {
  type: SchemaNodeType;
  className?: string;
}

export function SchemaTreeNodeIcon({ type, className = '' }: SchemaTreeNodeIconProps) {
  const Icon = ICON_MAP[type];
  const color = COLOR_MAP[type];

  return (
    <Icon
      size={16}
      className={`shrink-0 ${color} ${className}`}
      aria-hidden="true"
    />
  );
}
