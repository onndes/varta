export type HelperDecorationKey =
  | 'dowDutyCounts'
  | 'dowHistory'
  | 'assignmentIcons'
  | 'decisionInfo';

export interface HelperDecorations {
  dowDutyCounts: boolean;
  dowHistory: boolean;
  assignmentIcons: boolean;
  decisionInfo: boolean;
}

export const DEFAULT_HELPER_DECORATIONS: HelperDecorations = {
  dowDutyCounts: true,
  dowHistory: true,
  assignmentIcons: true,
  decisionInfo: true,
};
