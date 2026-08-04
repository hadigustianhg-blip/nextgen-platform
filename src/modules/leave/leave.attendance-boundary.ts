export type ApprovedLeaveForAttendance = {
  leaveRequestId: string;
  tenantId: string;
  outletId: string;
  employeeReferenceId: string;
  type: "LEAVE" | "PERMISSION" | "SICK";
  startDate: string;
  endDate: string;
};

// Phase 8 intentionally does not mutate Attendance. A later phase can implement
// this boundary after the attendance business rules are explicitly approved.
export function shouldSyncApprovedLeaveToAttendance(_request: ApprovedLeaveForAttendance) {
  void _request;
  return false;
}
