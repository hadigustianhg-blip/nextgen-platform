export function salaryPreviewMonthRange(date: string) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(end).padStart(2, "0")}`,
  };
}

export function shiftedSalaryPreviewMonthRange(date: string, offset: number) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return salaryPreviewMonthRange(shifted.toISOString().slice(0, 10));
}
