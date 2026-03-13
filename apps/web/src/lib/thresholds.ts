export interface Threshold {
  value: number;
  unit: 'L' | 'kg';
  source: string;
}

export const HSL_THRESHOLDS: Record<string, Threshold> = {
  '3.1A':      { value: 20,   unit: 'L',  source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '3.1A_petrol':{ value: 50,  unit: 'L',  source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '3.1B':      { value: 100,  unit: 'L',  source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '3.1C':      { value: 500,  unit: 'L',  source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '2.1.1A':    { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '2.1.1B':    { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '2.1.2A':    { value: 3000, unit: 'L',  source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '4.1.1A':    { value: 1,    unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '4.1.1B':    { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '4.2A':      { value: 1,    unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '6.1A':      { value: 1,    unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '6.1B':      { value: 10,   unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '6.1C':      { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '5.1.1':     { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '5.2':       { value: 10,   unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '4.3A':      { value: 10,   unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
  '8.2A':      { value: 100,  unit: 'kg', source: 'HSW Regs 2017, Schedule 9 Table 4' },
};
