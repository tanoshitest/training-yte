export type UnitSource = {
  unitNumber?: number;
  title: string;
};

export type SyllabusSource = {
  code: string;
  name: string;
  totalCourseDays?: number;
  units: UnitSource[];
  sourceVerified: boolean;
};
