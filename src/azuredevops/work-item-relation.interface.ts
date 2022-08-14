export type WorkItemRelationType = 'parent' | 'child';

export interface WorkItemRelation {
  type: WorkItemRelationType;
  url: string;
}
