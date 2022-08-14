import { WorkItemRelation } from './work-item-relation.interface';

export interface WorkItem {
  id: number;
  url: string;
  state: string;
  type: string;
  title: string;
  relations: WorkItemRelation[];
}
