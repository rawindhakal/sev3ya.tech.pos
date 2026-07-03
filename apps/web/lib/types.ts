// Shared domain types mirroring the API responses.

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { items: number };
}

export interface ModifierGroupRef {
  id: string;
  name: string;
}

export interface Modifier {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  groupId: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  isAvailable: boolean;
  imageUrl?: string | null;
  categoryId: string;
  category?: { id: string; name: string };
  modifierGroups?: ModifierGroupRef[];
}
