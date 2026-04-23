export type CapabilityEntryKind = 'tool' | 'workflow' | 'skill';

export interface CapabilityEntryRef<
  Kind extends CapabilityEntryKind = CapabilityEntryKind,
  Id extends string = string,
> {
  kind: Kind;
  id: Id;
  version: number;
}
