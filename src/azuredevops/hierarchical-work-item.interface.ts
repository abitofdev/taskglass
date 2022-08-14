import { WorkItem } from "./work-item.interface";

export interface HierarchicalWorkItem extends WorkItem {
  children: HierarchicalWorkItem[];
}
