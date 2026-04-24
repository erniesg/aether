export type CapabilityEntryKind = 'tool' | 'workflow' | 'skill';
export type CapabilityScope = 'workspace' | 'team';
export type CapabilityStatus = 'draft' | 'published' | 'archived';

export interface CapabilityEntryRef<
  Kind extends CapabilityEntryKind = CapabilityEntryKind,
  Id extends string = string,
> {
  kind: Kind;
  id: Id;
  version: number;
}
