export type HelperDecorationKey =
  | 'dowDutyCounts'
  | 'dowHistory'
  | 'workload'
  | 'assignmentIcons'
  | 'decisionInfo';

export interface HelperDecorations {
  dowDutyCounts: boolean;
  dowHistory: boolean;
  workload: boolean;
  assignmentIcons: boolean;
  decisionInfo: boolean;
}

export const DEFAULT_HELPER_DECORATIONS: HelperDecorations = {
  dowDutyCounts: true,
  dowHistory: true,
  workload: true,
  assignmentIcons: true,
  decisionInfo: true,
};
